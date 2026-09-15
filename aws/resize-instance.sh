#!/usr/bin/env bash
#
# Changes the instance size, and applies the stack template as it stands here.
#
#   ./aws/resize-instance.sh            # to t3.small, the default
#   ./aws/resize-instance.sh t3.micro   # back again
#
# WHY. 1 GB runs the JVM, nginx, dockerd and the OS with about 128 MB to spare,
# which is where the wedging comes from: over the line the kernel picks the
# victim, and a machine whose dockerd is being starved cannot restart anything,
# so the only way back is a reboot. The watchdog and the container memory limit
# make that survivable. t3.small is 2 GB and makes it unlikely.
#
# WHAT IT COSTS. t3.small is NOT free-tier eligible: about $0.0208 an hour in
# ap-south-1, roughly $15 a month, or about $0.50 a day if the instance is only
# up for the demonstration. t3.micro is free-tier eligible for 750 hours a
# month in the first year. Going back is this same command with t3.micro, so
# the decision is reversible — which is a different decision from one that is
# not.
#
# WHAT HAPPENS TO THE MACHINE. Changing the type of an existing instance is a
# stop, a modify and a start — "some interruptions", not a replacement. The
# root volume survives, so the images built on it and /etc/drishya.env are
# still there afterwards. User data runs once at first boot and is not re-run.
# The script checks the containers came back rather than assuming it.
#
# THE ADDRESS. The template carries an Elastic IP, which this applies along
# with the size, so from here the address survives a stop and a start and stops
# moving. On the first run since it was added the URL changes once, because the
# instance gives up its auto-assigned address for the fixed one. That should be
# the last time it changes.
#
# IT DOES NOT TOUCH THE IMAGES. This is a stack operation only. Deploying code
# is still aws/build-on-instance.sh.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
STACK="${STACK:-drishya}"
REPO_URL="${REPO_URL:-https://github.com/Nsi442/Drishya.git}"
BRANCH="${BRANCH:-main}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || die "aws CLI not found."
aws sts get-caller-identity >/dev/null 2>&1 || die "AWS credentials are not working."

INSTANCE="${INSTANCE:-$(aws cloudformation describe-stacks --region "$REGION" \
    --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
    --output text 2>/dev/null)}"
SITE=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>/dev/null || echo '')
SITE_DNS=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteDnsName'].OutputValue" --output text 2>/dev/null || echo '')

[ -n "$INSTANCE" ] && [ "$INSTANCE" != "None" ] || die "Could not find the instance id. Is the stack deployed?"
echo "instance: $INSTANCE"
echo "site    : ${SITE:-unknown}"
[ -n "$SITE_DNS" ] && echo "by name : $SITE_DNS   <- use this one on a phone"

# --- running a step -------------------------------------------------------
#
# Polled rather than `ssm wait command-executed`: that waiter gives up after
# about a hundred seconds, and a Maven build on a t3.micro takes minutes. A
# waiter that times out mid-build looks exactly like a build that failed.

run_step() {                       # run_step "label" "minutes" 'shell...'
    local label="$1" limit="$2" script="$3" id status b64
    say "$label"

    # The script travels base64-encoded and is decoded on the instance.
    #
    # Not for secrecy — it is plainly visible in the SSM console. It is because
    # the alternative is embedding a multi-line shell script inside a JSON
    # string inside a shell argument, which means escaping quotes, backslashes
    # and newlines through three layers that each have their own rules. Base64
    # is alphanumeric, so there is nothing left to escape and nothing for Git
    # Bash on Windows to mangle on the way past.
    b64=$(printf '%s' "$script" | base64 | tr -d '\n')

    id=$(aws ssm send-command --region "$REGION" \
            --instance-ids "$INSTANCE" \
            --document-name AWS-RunShellScript \
            --comment "$label" \
            --parameters commands="[\"echo $b64 | base64 -d > /tmp/drishya-step.sh\",\"bash /tmp/drishya-step.sh\"]" \
            --query 'Command.CommandId' --output text) \
        || die "Could not send the command. Is the instance registered with SSM?"

    for _ in $(seq 1 $(( limit * 6 ))); do
        sleep 10
        status=$(aws ssm get-command-invocation --region "$REGION" \
                    --command-id "$id" --instance-id "$INSTANCE" \
                    --query Status --output text 2>/dev/null || echo Pending)
        case "$status" in
            Success)   break ;;
            Failed|Cancelled|TimedOut) break ;;
            *)         printf '.' ;;
        esac
    done
    echo

    aws ssm get-command-invocation --region "$REGION" \
        --command-id "$id" --instance-id "$INSTANCE" \
        --query StandardOutputContent --output text | tail -30

    if [ "$status" != "Success" ]; then
        aws ssm get-command-invocation --region "$REGION" \
            --command-id "$id" --instance-id "$INSTANCE" \
            --query StandardErrorContent --output text | tail -30 >&2
        die "$label failed ($status). Command id $id."
    fi
}


SIZE="${1:-t3.small}"

case "$SIZE" in
    t3.micro|t3.small|t4g.micro|t4g.small) ;;
    *) die "InstanceType must be one of t3.micro, t3.small, t4g.micro, t4g.small (the template's AllowedValues)." ;;
esac

CURRENT=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Parameters[?ParameterKey=='InstanceType'].ParameterValue | [0]" \
    --output text 2>/dev/null)

say "Resizing"
echo "  stack   : $STACK"
echo "  instance: $INSTANCE"
echo "  from    : ${CURRENT:-unknown}"
echo "  to      : $SIZE"

if [ "$CURRENT" = "$SIZE" ]; then
    # Not an early exit. The size being unchanged says nothing about the
    # TEMPLATE being unchanged, and this script applies both — short-circuiting
    # here would silently skip the Elastic IP on a second run. `deploy` with
    # --no-fail-on-empty-changeset is a no-op when there is genuinely nothing
    # to do, which is the right way to decide that.
    echo
    echo "  Already $SIZE; applying the template anyway in case it has moved."
fi

# `deploy`, not `update-stack`, and the difference matters here.
#
# update-stack replaces the WHOLE parameter set: anything not listed reverts to
# its template default, and an unlisted DbPassword or JwtSecret means an
# application that will not start, or one that signs everyone out, discovered
# some minutes later. `deploy` keeps every parameter not named in
# --parameter-overrides at the value the stack already holds, so the secrets are
# never read by this script, never passed through it and never printed.
#
# The template file rather than --use-previous-template, because the repository
# is the source of truth for the stack and there is a change in it that has to
# land: the Elastic IP. One update applies both.
say "Updating the stack (the instance stops, changes size and starts again)"
echo "  this takes about three to five minutes"
aws cloudformation deploy \
    --region "$REGION" \
    --stack-name "$STACK" \
    --template-file aws/drishya-nocdn.cfn.yaml \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides InstanceType="$SIZE" \
    || die "The update did not complete. The stack events say why: aws cloudformation describe-stack-events --stack-name $STACK --max-items 20"

# --- what it is now -------------------------------------------------------

# A type change is a stop, a change and a start. CloudFormation reporting
# UPDATE_COMPLETE does not mean the instance is back and reachable: the first
# run read the type while the machine was still coming up and printed the size
# it used to be, then sent an SSM command to an instance whose agent had not
# re-registered and failed with "Instances not in a valid state".
say "Waiting for the instance to come back"
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE" \
    || die "The instance did not reach the running state."
echo "  ec2: running"

# Running is not the same as manageable. SSM's agent registers a little after
# boot, and every step below goes through it.
for i in $(seq 1 30); do
    PING=$(aws ssm describe-instance-information --region "$REGION" \
        --filters "Key=InstanceIds,Values=$INSTANCE" \
        --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || echo None)
    [ "$PING" = "Online" ] && { echo "  ssm: online"; break; }
    printf '.'
    sleep 10
done
[ "$PING" = "Online" ] || die "The instance is running but SSM never came online. Wait a minute and re-run."

NEW_TYPE=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" \
    --query "Reservations[0].Instances[0].InstanceType" --output text)

# Say so rather than printing a size and leaving the reader to notice.
if [ "$NEW_TYPE" != "$SIZE" ]; then
    printf '\n\033[31m  WARNING: asked for %s, the instance is %s.\033[0m\n' "$SIZE" "$NEW_TYPE"
    echo "  The stack updated but the type did not change. Check that the template's"
    echo "  InstanceType parameter is what aws/drishya-nocdn.cfn.yaml is deployed with."
fi
NEW_URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)

say "Done"
echo "  instance type: $NEW_TYPE"
echo "  site URL     : $NEW_URL"
echo
echo "  The stack now carries an Elastic IP, so this address survives a stop and"
echo "  a start and will not move again. If this is the first run since it was"
echo "  added the URL has changed once, now — update any tab, bookmark or slide,"
echo "  and that should be the last time."

# --- are the containers back? ---------------------------------------------
#
# They should be: --restart always survives a stop/start, and the images are on
# the root volume, which a resize does not touch. Checked rather than assumed,
# because "should be" is how an afternoon disappears.

run_step "Checking the containers came back" 5 "
free -h
echo
docker ps --format '{{.Names}}  {{.Status}}'
echo
docker images --format '{{.Repository}}:{{.Tag}}' | grep drishya || echo 'NO IMAGES — run aws/build-on-instance.sh'
"

if [ -n "$NEW_URL" ]; then
    say "Waiting for the site"
    for _ in $(seq 1 30); do
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$NEW_URL/actuator/health/readiness" || echo 000)
        [ "$code" = "200" ] && { echo "  readiness: up"; break; }
        sleep 10
    done
    [ "$code" = "200" ] || echo "  Not up yet. If the containers are missing above, run: bash aws/build-on-instance.sh"
fi
