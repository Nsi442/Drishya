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


# --- 1. is RDS itself restarting? -----------------------------------------

DB=$(aws rds describe-db-instances --region "$REGION" \
        --query "DBInstances[?contains(DBInstanceIdentifier, 'drishya')].DBInstanceIdentifier | [0]" \
        --output text 2>/dev/null)

say "The database instance"
if [ -z "$DB" ] || [ "$DB" = "None" ]; then
    echo "  No RDS instance with 'drishya' in its name. Is it in another region?"
else
    aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$DB" \
        --query "DBInstances[0].{id:DBInstanceIdentifier,status:DBInstanceStatus,class:DBInstanceClass,storageGB:AllocatedStorage,engine:EngineVersion,multiAZ:MultiAZ}" \
        --output table

    say "RDS events, last 7 days (a restart or a low-storage warning shows here)"
    aws rds describe-events --region "$REGION" \
        --source-identifier "$DB" --source-type db-instance --duration 10080 \
        --query "Events[].{when:Date,message:Message}" --output table 2>/dev/null \
        || echo "  (no events returned)"

    say "Memory, CPU credits, storage and connections over the last 3 hours"
    # FreeableMemory near zero is cause 1. CPUCreditBalance near zero is cause
    # 3. DatabaseConnections pinned at the pool size is cause 4.
    for M in FreeableMemory CPUCreditBalance FreeStorageSpace DatabaseConnections; do
        printf '  %-22s' "$M"
        aws cloudwatch get-metric-statistics --region "$REGION" \
            --namespace AWS/RDS --metric-name "$M" \
            --dimensions Name=DBInstanceIdentifier,Value="$DB" \
            --start-time "$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-3H +%Y-%m-%dT%H:%M:%SZ)" \
            --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --period 900 --statistics Minimum Average \
            --query "sort_by(Datapoints,&Timestamp)[-6:].[Minimum,Average]" \
            --output text 2>/dev/null | tr '\n' ' ' || true
        echo
    done
    echo "  (FreeableMemory and FreeStorageSpace are bytes; divide by 1048576 for MB)"
fi

# --- 2. or is it the API container being killed on the instance? ----------

run_step "What the instance says: memory, OOM kills, container restarts" 5 "
echo '--- memory and disk ---'
free -h
df -h / | tail -1
echo
echo '--- kernel OOM kills (this is cause 2, and it names the victim) ---'
dmesg 2>/dev/null | grep -iE 'out of memory|killed process|oom-kill' | tail -10 || echo '  none in the current ring buffer'
journalctl -k --since '2 days ago' 2>/dev/null | grep -iE 'out of memory|killed process|oom-kill' | tail -10 || true
echo
echo '--- containers: RestartCount and OOMKilled are the two that matter ---'
docker ps -a --format '{{.Names}}  {{.Status}}'
for c in api web; do
  printf '%s ' \$c
  docker inspect \$c --format 'restarts={{.RestartCount}} oomKilled={{.State.OOMKilled}} exit={{.State.ExitCode}} started={{.State.StartedAt}}' 2>/dev/null || echo '(missing)'
done
echo
echo '--- the API container on database trouble ---'
docker logs api --since 6h 2>&1 | grep -iE 'HikariPool|connection is not available|could not open|socket|terminating connection|FATAL|OutOfMemory|Communications link' | tail -20 || echo '  nothing matching in the last 6 hours'
echo
echo '--- and how it has been restarting ---'
docker logs api --since 48h 2>&1 | grep -c 'Started DrishyaBackendApplication' | xargs echo '  application starts in 48h:'
"

say "Reading this"
cat <<'NOTE'
  RDS status "available" with no restart events, but restarts>0 or
  oomKilled=true on the api container  -> the DATABASE is fine and the API is
  being killed for memory on a 913 MB instance. The fix is JVM heap or a bigger
  instance, not the database.

  FreeableMemory bottoming out near zero, or an RDS event saying the instance
  was restarted  -> the database really is dying. db.t4g.micro has 1 GB.

  CPUCreditBalance at or near zero  -> burst credits are exhausted; it is not
  crashing, it is throttled to a crawl and everything times out.

  "connection is not available, request timed out after" in the API log with a
  healthy database  -> the pool is exhausted. Pool size is 5 by design; a leak
  or a long transaction is holding them.
NOTE

# The watchdog keeps the only contemporaneous record of a wedge: when it fired
# and how much memory was free at that moment. Added after the fact — this
# script predates the watchdog, so it was answering "is the database unwell"
# while the evidence for "did the API wedge" sat unread on the instance.
run_step "What the watchdog has seen" 3 "
echo '=== timer ==='
systemctl list-timers drishya-watchdog.timer --no-pager --all 2>/dev/null | sed -n '1,2p' || echo 'no timer'
systemctl is-enabled drishya-watchdog.timer 2>/dev/null || echo 'not enabled'
echo
echo '=== restarts it has performed ==='
if [ -f /var/log/drishya-watchdog.log ]; then
  wc -l < /var/log/drishya-watchdog.log | xargs echo 'log lines:'
  echo '--- last 20 ---'
  tail -20 /var/log/drishya-watchdog.log
else
  echo 'no log yet — the watchdog has never had to act'
fi
echo
echo '=== container, right now ==='
docker inspect -f 'restarts={{.RestartCount}} oomkilled={{.State.OOMKilled}} exit={{.State.ExitCode}} health={{.State.Health.Status}}' api 2>/dev/null || echo 'no api container'
echo 'memory limit:' \$(docker inspect -f '{{.HostConfig.Memory}}' api 2>/dev/null | awk '{printf \"%dm\", \$1/1024/1024}')
echo
echo '=== the JVM own account of its heap ==='
docker exec api sh -c 'jcmd 1 GC.heap_info 2>/dev/null | head -4' 2>/dev/null || echo '(jcmd unavailable in this image)'
"
