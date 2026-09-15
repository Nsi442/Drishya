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
# responsive. MaxRAMPercentage makes the JVM read the cgroup limit rather than
# guess, so the two numbers cannot drift apart the way -Xmx and --memory would.
#
# The image is checked BEFORE the container is removed. Removing a container
# and then discovering there is no image to start is the failure that took the
# site down last time, and it is cheap to make impossible.

run_step "Restarting the API under a memory limit" 5 "
set -e
if [ -z \"\$(docker images -q drishya-api:local 2>/dev/null)\" ]; then
  echo 'ERROR: drishya-api:local is not on this instance.'
  echo 'Nothing has been changed. Run aws/build-on-instance.sh to build it.'
  exit 1
fi
echo 'image present:' \$(docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep drishya-api | head -1)

# Same reasoning as the image check, one layer along. /etc/drishya.env is
# written by the stack's user data at first boot; without it the docker run
# below fails, and it would fail AFTER the running container had been removed.
# Check first, change nothing if it is missing.
if [ ! -f /etc/drishya.env ]; then
  echo 'ERROR: /etc/drishya.env is missing, so the API has no database settings.'
  echo 'Nothing has been changed. aws/repair-api.sh writes that file.'
  exit 1
fi
echo 'settings present:' \$(grep -c . /etc/drishya.env) 'lines'

docker network create drishya 2>/dev/null || true
docker rm -f api 2>/dev/null || true
docker run -d --name api --network drishya --restart always \
  --memory=700m --memory-swap=1400m \
  --env-file /etc/drishya.env \
  -e JAVA_TOOL_OPTIONS='-XX:MaxRAMPercentage=60 -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC' \
  drishya-api:local >/dev/null
echo 'api started under a 700m limit'

# The web container is nginx and needs no limit, so it is left running rather
# than recreated — less downtime, and one less thing that can fail to come
# back. Started only if it is actually missing.
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

sleep 60
docker ps --format '{{.Names}}\t{{.Status}}'
echo '--- api startup ---'
docker logs api 2>&1 | grep -iE 'Started DrishyaBackend|Successfully applied|ERROR' | tail -10
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

WATCHDOG_B64=$(cat <<'WATCHDOG' | base64 | tr -d '\n'
#!/usr/bin/env bash
# Restarts the Drishya API when its own healthcheck says it is unhealthy.
# Installed by aws/rescue.sh. Run every two minutes by drishya-watchdog.timer.
set -u
LOG=/var/log/drishya-watchdog.log

state=$(docker inspect -f '{{.State.Health.Status}}' api 2>/dev/null || echo missing)
running=$(docker inspect -f '{{.State.Running}}' api 2>/dev/null || echo false)

case "$state" in
  healthy|starting)
    exit 0 ;;
  missing)
    if [ "$running" != "true" ]; then
      echo "$(date -Is) api container missing; starting it" >> "$LOG"
      docker start api >/dev/null 2>&1 || true
    fi
    exit 0 ;;
  unhealthy)
    echo "$(date -Is) api unhealthy; restarting" >> "$LOG"
    free -m | sed -n '2p' >> "$LOG"
    docker restart api >/dev/null 2>&1 || true
    exit 0 ;;
esac
WATCHDOG
)

SERVICE_B64=$(cat <<'UNIT' | base64 | tr -d '\n'
[Unit]
Description=Restart the Drishya API when its own healthcheck says it is unhealthy
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/drishya-watchdog.sh
UNIT
)

TIMER_B64=$(cat <<'UNIT' | base64 | tr -d '\n'
[Unit]
Description=Run the Drishya watchdog every two minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=30s

[Install]
WantedBy=timers.target
UNIT
)

run_step "Installing the watchdog that acts on the healthcheck" 3 "
set -e
echo $WATCHDOG_B64 | base64 -d > /usr/local/bin/drishya-watchdog.sh
chmod +x /usr/local/bin/drishya-watchdog.sh
bash -n /usr/local/bin/drishya-watchdog.sh && echo 'watchdog script parses'
/usr/local/bin/drishya-watchdog.sh && echo 'watchdog dry run exited 0'

if command -v systemctl >/dev/null 2>&1; then
  echo $SERVICE_B64 | base64 -d > /etc/systemd/system/drishya-watchdog.service
  echo $TIMER_B64   | base64 -d > /etc/systemd/system/drishya-watchdog.timer
  chmod 644 /etc/systemd/system/drishya-watchdog.service /etc/systemd/system/drishya-watchdog.timer
  systemctl daemon-reload
  systemctl enable --now drishya-watchdog.timer
  echo \"timer enabled: \$(systemctl is-enabled drishya-watchdog.timer), \$(systemctl is-active drishya-watchdog.timer)\"
  systemctl list-timers drishya-watchdog.timer --no-pager --all | sed -n '2p'
elif [ -d /etc/cron.d ]; then
  printf '%s\\n' '*/2 * * * * root /usr/local/bin/drishya-watchdog.sh' > /etc/cron.d/drishya-watchdog
  chmod 644 /etc/cron.d/drishya-watchdog
  systemctl restart crond 2>/dev/null || systemctl restart cron 2>/dev/null || true
  echo 'installed via cron.d'
else
  echo 'ERROR: neither systemd nor /etc/cron.d is available; nothing will run the watchdog.'
  exit 1
fi
"

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
echo '=== through nginx, from the box ==='
curl -s -o /dev/null -w 'GET /            %{http_code}  %{time_total}s\n' http://localhost/ || true
curl -s -o /dev/null -w 'GET /api/health  %{http_code}  %{time_total}s\n' http://localhost/actuator/health || true
"

say "Done"
cat <<'NEXT'
The API now runs under a memory limit it cannot exceed, and a watchdog restarts
it within two minutes if its healthcheck goes unhealthy. Neither needs you to
be watching.

If it still wedges, the box is simply too small for the workload and the fix is
the larger instance:

    bash aws/resize-instance.sh        # t3.small, and a fixed address

To see what is happening without changing anything:

    bash aws/diagnose-db.sh
    aws ssm start-session --target <instance>   # then: tail /var/log/drishya-watchdog.log
NEXT
