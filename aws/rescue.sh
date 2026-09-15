#!/usr/bin/env bash
# Stops the deployed API wedging, WITHOUT rebuilding anything.
#
#   ./aws/rescue.sh
#
# WHY THIS EXISTS SEPARATELY FROM build-on-instance.sh. That script carries the
# same three protections this one does — reclaimed disk, a memory limit on the
# API container, a watchdog that acts on the healthcheck — but it applies them
# as part of a full rebuild: clone, two docker builds, twenty-five minutes.
#
# That is the wrong instrument for a box that is already in trouble. A rebuild
# WRITES several hundred megabytes before it frees any, so on an instance that
# is wedging because the root volume is full it is the one thing most likely to
# fail, and it failed exactly that way once already ("No space left on device",
# reported by Maven, from inside a layer, reading like a code fault).
#
# So this does the protections and nothing else. No clone, no build, no
# CloudFormation, no resize. It uses the images already on the instance, takes
# about two minutes, and needs no free disk to succeed — it is the thing that
# MAKES free disk.
#
# WHAT IT DOES NOT DO. It does not deploy new code: the running image is
# whatever was last built there. Run it when the site is crashing and you want
# it to stop crashing; run build-on-instance.sh when you want new code, on a
# box that is healthy enough to build on.
#
# Needs only the AWS CLI. Everything goes through ssm send-command.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
STACK="${STACK:-drishya}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || die "aws CLI not found."

# The watchdog install and the container memory sizing are shared with the
# other script that does both; see the header of aws/common.sh. Sourced HERE,
# at the top, because a step further down uses MEMORY_SIZING and loading it
# beside its other use left that one unbound.
COMMON_LIB="$(dirname "${BASH_SOURCE[0]}")/common.sh"
[ -f "$COMMON_LIB" ] || die "Missing $COMMON_LIB — run this from a full checkout of the repository."
# shellcheck source=aws/common.sh
source "$COMMON_LIB"
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

# Polled rather than `ssm wait command-executed`, which gives up after about a
# hundred seconds. Nothing here is that slow, but the failure mode of a waiter
# timing out mid-step — a step that worked, reported as failed — is worth not
# having.
run_step() {                       # run_step "label" "minutes" 'shell...'
    local label="$1" limit="$2" script="$3" id status b64
    say "$label"

    # Base64 for the same reason every other script here does it: the payload
    # becomes alphanumeric, so there is nothing left for the SSM JSON parameter,
    # the shell, or Git Bash on Windows to mangle on the way past.
    b64=$(printf '%s' "$script" | base64 | tr -d '\n')

    id=$(aws ssm send-command --region "$REGION" \
            --instance-ids "$INSTANCE" \
            --document-name AWS-RunShellScript \
            --comment "$label" \
            --parameters commands="[\"echo $b64 | base64 -d > /tmp/drishya-rescue.sh\",\"bash /tmp/drishya-rescue.sh\"]" \
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
        --query StandardOutputContent --output text | tail -40

    if [ "$status" != "Success" ]; then
        aws ssm get-command-invocation --region "$REGION" \
            --command-id "$id" --instance-id "$INSTANCE" \
            --query StandardErrorContent --output text | tail -30 >&2
        die "$label failed ($status). Command id $id."
    fi
}

# --- 1. what state is it actually in --------------------------------------
#
# Printed before anything is changed, so the output is a record of what was
# wrong rather than only of what was done. "Avail" near zero with a healthy
# "Used" percentage still means the volume is full.

run_step "Looking at the instance before touching it" 3 "
echo '=== disk ==='
df -h / | tail -1
echo
echo '=== memory ==='
free -m | head -2
swapon --show 2>/dev/null | tail -n +2 | head -2 || echo 'swap: none'
echo
echo '=== containers ==='
docker ps -a --format '{{.Names}}\t{{.Status}}' 2>/dev/null || echo 'docker not answering'
echo
echo '=== api health ==='
docker inspect -f '{{.State.Health.Status}}' api 2>/dev/null || echo 'no api container'
echo
echo '=== kernel OOM kills ==='
dmesg -T 2>/dev/null | grep -ci 'killed process' || echo 0
echo
echo '=== api restarts since it was created ==='
docker inspect -f '{{.RestartCount}}' api 2>/dev/null || echo 'n/a'
"

# --- 2. disk --------------------------------------------------------------
#
# Every removal here is of something rebuildable or already consumed. There is
# deliberately NO "docker image prune -a": that removes every image not
# currently used by a container, which is not the same as "old", and running it
# at the wrong moment once took the site down for want of the image it was
# about to start. Dangling layers and the build cache only.

run_step "Reclaiming disk" 5 "
echo 'before:'
df -h / | tail -1
echo
docker builder prune -af 2>/dev/null | tail -1 || true
docker image prune -f 2>/dev/null | tail -1 || true
docker container prune -f 2>/dev/null | tail -1 || true
# The api container is chatty — an ETA cycle a minute, for weeks — and json
# logs grow without bound. Truncated rather than deleted so a running container
# keeps its open file handle.
find /var/lib/docker/containers -name '*-json.log' -exec truncate -s 0 {} + 2>/dev/null || true
journalctl --vacuum-size=50M >/dev/null 2>&1 || true
# Left behind by any build that ran on the box. Regenerated by the next one.
rm -rf /root/Drishya/Drishya.Backend/target 2>/dev/null || true
echo
echo 'after:'
df -h / | tail -1
"

# --- 3. the memory limit --------------------------------------------------
#
# THE ACTUAL CAUSE OF THE REBOOTS. The instance has 913 MB and runs this JVM,
# nginx, dockerd and the OS. Unlimited, the JVM sizes its heap from the whole
# machine and reaches for most of it; when it goes over, the KERNEL chooses the
# victim, and a box whose dockerd is being starved cannot restart anything.
# That is why only a reboot ever fixed it.
#
# With --memory, Docker enforces the ceiling instead: the container is killed,
# --restart always brings it back, and the rest of the machine stays
# responsive.
#
# The limit is sized from the host. A t3.micro has 913 MB and gets 700m; a
# t3.small has 1,909 MB and can afford 1000m. Hard-coding 700m on the larger
# box would throttle it for no reason.

run_step "Applying a memory limit to the API" 5 "
set -e
$MEMORY_SIZING
if [ -z \"\$(docker ps -aq -f name=^api\$)\" ]; then
  # No container at all. This is the only path that needs an image, and it is
  # the only path that may create one from scratch.
  if [ -z \"\$(docker images -q drishya-api:local 2>/dev/null)\" ]; then
    echo 'ERROR: the api container is missing and drishya-api:local is not on this instance.'
    echo 'Nothing has been changed. Run aws/build-on-instance.sh to build and start it.'
    exit 1
  fi
  if [ ! -f /etc/drishya.env ]; then
    echo 'ERROR: /etc/drishya.env is missing, so the API has no database settings.'
    echo 'Nothing has been changed. aws/repair-api.sh writes that file.'
    exit 1
  fi
  docker network create drishya 2>/dev/null || true
  docker run -d --name api --network drishya --restart always \
    --memory=\$LIM --memory-swap=\$SWP \
    --env-file /etc/drishya.env \
    -e JAVA_TOOL_OPTIONS=\"$JVM_OPTS\" \
    drishya-api:local >/dev/null
  echo \"api was missing; started it from drishya-api:local under a \$LIM limit\"
else
  # The container exists, so change its ceiling IN PLACE rather than recreating
  # it.
  #
  # Recreating would mean reconstructing the run command, and the stack's user
  # data starts this container with a CloudWatch log driver and stream that a
  # naive 'docker run --env-file ... drishya-api:local' does not carry. Losing
  # those sends the logs back to Docker's local json file — readable only from
  # a shell on the box, which is exactly what is unavailable when the thing
  # this script exists for is happening. It would also pin the container to a
  # locally built image on an instance whose images came from ECR.
  #
  # 'docker update' writes the cgroup limit and the container's stored host
  # config, so it survives the restarts that --restart always and the watchdog
  # perform. No downtime, nothing else touched.
  docker update --memory=\$LIM --memory-swap=\$SWP api >/dev/null 2>&1 \
    || docker update --memory=\$LIM api >/dev/null 2>&1 \
    || { echo 'ERROR: could not set a memory limit on the api container.'; exit 1; }
  # The memory limit can be changed in place. The JVM flags cannot — they are
  # environment, fixed when the container was created — so if they are stale the
  # container has to be recreated. That is the only way the metaspace fix
  # reaches a running instance without a fifteen-minute rebuild.
  #
  # Recreated from what the CONTAINER already uses, not from assumptions: its
  # own image, its own log driver and options. An earlier version of this
  # script hard-coded drishya-api:local and a bare run, which on an
  # ECR-provisioned instance would have pinned the wrong image and dropped the
  # CloudWatch log stream that is the only way to read a log without a shell.
  WANT='-XX:MaxMetaspaceSize=256m'
  HAVE=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' api | grep JAVA_TOOL_OPTIONS || true)
  # -- and -F, because the pattern begins with a dash and contains none of
  # grep's metacharacters: without them grep reads -XX:... as an option, the
  # match always fails, and the container is recreated on every single run.
  if ! printf '%s' \"\$HAVE\" | grep -qF -- \"\$WANT\"; then
    IMG=\$(docker inspect -f '{{.Config.Image}}' api)
    LOGDRV=\$(docker inspect -f '{{.HostConfig.LogConfig.Type}}' api)
    LOGOPTS=\$(docker inspect -f '{{range \$k, \$v := .HostConfig.LogConfig.Config}}--log-opt {{\$k}}={{\$v}} {{end}}' api)
    echo \"JVM flags are stale; recreating from \$IMG (log driver: \$LOGDRV)\"
    docker rm -f api >/dev/null 2>&1 || true
    docker run -d --name api --network drishya --restart always \
      --memory=\$LIM --memory-swap=\$SWP \
      --log-driver \"\$LOGDRV\" \$LOGOPTS \
      --env-file /etc/drishya.env \
      -e JAVA_TOOL_OPTIONS=\"$JVM_OPTS\" \
      \"\$IMG\" >/dev/null
    sleep 25
  fi
  APPLIED=\$(docker inspect -f '{{.HostConfig.Memory}}' api)
  echo \"applied limit: \$((APPLIED / 1024 / 1024))m\"
  echo \"heap flags in effect: \$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' api | grep JAVA_TOOL_OPTIONS || echo '(none set - the JVM sizes from the cgroup limit above)')\"
fi

if [ -z \"\$(docker ps -q -f name=^web\$)\" ]; then
  if [ -n \"\$(docker images -q drishya-web:local 2>/dev/null)\" ]; then
    docker rm -f web 2>/dev/null || true
    docker run -d --name web --network drishya --restart always -p 80:80 drishya-web:local >/dev/null
    echo 'web was not running; started it'
  else
    echo 'WARNING: web is not running and drishya-web:local is missing'
  fi
else
  echo 'web already running; left alone'
fi

docker ps --format '{{.Names}}\t{{.Status}}'
"

# --- 4. the watchdog ------------------------------------------------------
#
# The image has declared a HEALTHCHECK all along and nothing acted on it.
# --restart always restarts a container that EXITS; it does nothing for one
# that is running and unhealthy. A JVM alive but wedged therefore stays wedged,
# which is the state that has been requiring a manual reboot.
#
# Every two minutes: unhealthy means restart and log why; missing means start.
#
# Scheduled with a SYSTEMD TIMER, not cron. Amazon Linux 2023 ships no cron at
# all — cronie is not installed and /etc/cron.d does not exist — so the first
# version of this step died on a redirect into a directory that was not there,
# leaving the watchdog script on disk with nothing ever running it. A timer is
# the native mechanism and needs no package installed.


run_step "Installing the watchdog that acts on the healthcheck" 3 "$WATCHDOG_STEP"

# --- 5. did it work -------------------------------------------------------

run_step "Checking the site answers" 3 "
echo '=== disk ==='
df -h / | tail -1
echo
echo '=== memory ==='
free -m | head -2
echo
echo '=== containers ==='
docker ps --format '{{.Names}}\t{{.Status}}'
echo
# Wait for the API to finish starting before judging it. The previous version
# curled immediately, and on a run where step 3 had just recreated the
# container it reported 502 against a container that had been up thirteen
# seconds — a cold JVM, not a fault, printed as the script's verdict.
#
# Every dollar in here is escaped so it runs on the INSTANCE. An unescaped
# \$(seq 1 30) expanded locally instead, and thirty numbers separated by
# newlines turned 'for _ in ...' into a syntax error the moment it landed —
# which is why the loop is a counter rather than a seq.
i=0
h=unknown
while [ \$i -lt 30 ]; do
  h=\$(docker inspect -f '{{.State.Health.Status}}' api 2>/dev/null || echo missing)
  [ \"\$h\" = starting ] || break
  sleep 5
  i=\$((i + 1))
done
echo \"api health: \$h\"
echo
echo '=== through nginx, from the box ==='
curl -s -o /dev/null -w 'GET /            %{http_code}  %{time_total}s\n' http://localhost/ || true
curl -s -o /dev/null -w 'GET /actuator/health %{http_code}  %{time_total}s\n' http://localhost/actuator/health || true
"

say "Done"

# What to suggest next depends on the box this actually ran against. Telling
# someone already on a t3.small to resize to a t3.small is the kind of stale
# advice that makes a script look like it is not reading the room.
TYPE=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" \
    --query "Reservations[0].Instances[0].InstanceType" --output text 2>/dev/null || echo unknown)

cat <<'NEXT'
The API now runs under a memory limit it cannot exceed, and a watchdog restarts
it within two minutes if its healthcheck goes unhealthy. Neither needs you to
be watching.
NEXT

echo
echo "  instance: $TYPE"
case "$TYPE" in
    *.micro)
        echo "  If it still wedges, the box is too small for the workload:"
        echo
        echo "      bash aws/resize-instance.sh      # t3.small, and a fixed address"
        ;;
    *)
        echo "  Already on the larger instance, so a resize is not the next lever."
        echo "  If it still wedges, read the watchdog log before changing anything —"
        echo "  it records every restart and the free memory at the time."
        ;;
esac

cat <<'NEXT'

  Confirm the watchdog is scheduled, not just installed:

      aws ssm send-command --instance-ids <instance> --document-name AWS-RunShellScript \
        --parameters 'commands=["systemctl list-timers drishya-watchdog.timer --no-pager"]'

  To see what is happening without changing anything:

      bash aws/diagnose-db.sh
NEXT
