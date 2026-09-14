#!/usr/bin/env bash
# Builds and runs Drishya ON the EC2 instance, without pushing to ECR.
#
#   ./aws/build-on-instance.sh
#
# WHY THIS EXISTS. The normal path is aws/deploy-nocdn.sh, which builds the
# images on your machine and pushes them to ECR. That is the right way round
# when it works: the instance has 1 GB of RAM and a Maven build there is slow.
#
# It stops working when your machine cannot upload to ECR — a corporate
# network, a VPN, a flaky link, Docker Desktop's own DNS. The symptom is a push
# that retries every layer and never finishes, sometimes even for layers that
# reported "Layer already exists" a minute earlier. No amount of retrying fixes
# a link that cannot sustain the transfer.
#
# So this turns the problem around. The instance is already inside AWS, so it
# clones from GitHub and builds locally, and nothing is uploaded from your side
# at all. The images never touch a registry.
#
# THE TRADE, STATED PLAINLY. The images exist only on that one instance. If
# CloudFormation ever replaces it, they are gone and this has to run again —
# whereas an image in ECR survives. Use aws/deploy-nocdn.sh whenever your
# network lets you.
#
# Needs only the AWS CLI. No Session Manager plugin: every step goes through
# ssm send-command, the same channel deploy-nocdn.sh already uses for PostGIS.
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

[ -n "$INSTANCE" ] && [ "$INSTANCE" != "None" ] || die "Could not find the instance id. Is the stack deployed?"
echo "instance: $INSTANCE"
echo "site    : ${SITE:-unknown}"

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
    echo
    echo "  Already $SIZE. Nothing to do."
    exit 0
fi

# Every other parameter is carried forward untouched.
#
# update-stack replaces the whole parameter set, so anything not listed reverts
# to its template default — which for DbPassword and JwtSecret would be wrong in
# a way that is not obvious until the application will not start, or signs
# everyone out. UsePreviousValue says "leave this exactly as it is" without this
# script ever having to read a secret, let alone print one.
OTHERS=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Parameters[?ParameterKey!='InstanceType'].ParameterKey" --output text)

PARAMS="ParameterKey=InstanceType,ParameterValue=$SIZE"
for k in $OTHERS; do
    PARAMS="$PARAMS ParameterKey=$k,UsePreviousValue=true"
done

say "Updating the stack (the instance stops, changes size and starts again)"
aws cloudformation update-stack --region "$REGION" --stack-name "$STACK" \
    --use-previous-template \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameters $PARAMS >/dev/null \
    || die "update-stack was refused. If it says 'No updates are to be performed', the size is already $SIZE."

echo "  waiting — this takes about three to five minutes"
aws cloudformation wait stack-update-complete --region "$REGION" --stack-name "$STACK" \
    || die "The update did not complete. Look at the stack events in the console: aws cloudformation describe-stack-events --stack-name $STACK"

# --- what it is now -------------------------------------------------------

NEW_TYPE=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" \
    --query "Reservations[0].Instances[0].InstanceType" --output text)
NEW_URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)

say "Done"
echo "  instance type: $NEW_TYPE"
echo "  site URL     : $NEW_URL"
echo
echo "  THE URL HAS CHANGED. There is no Elastic IP on this stack, so stopping"
echo "  and starting the instance hands out a new public DNS name. Update any"
echo "  tab, bookmark or slide that holds the old one."

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
