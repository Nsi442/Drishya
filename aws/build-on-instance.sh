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

# --- 1. swap and source ---------------------------------------------------
#
# Swap first and not optionally. A Maven build of this project needs more than
# the 1 GB a t3.micro has, and without swap the kernel kills javac — which
# surfaces as a truncated build log rather than as "out of memory", and reads
# like a compiler bug.

run_step "Preparing the instance (swap, git, source)" 5 "
set -e
if ! swapon --show 2>/dev/null | grep -q swapfile; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo 'swap: created'
else
  echo 'swap: already on'
fi
free -h | head -3
command -v git >/dev/null || dnf install -y git >/dev/null 2>&1
rm -rf /root/Drishya
git clone --depth 1 --branch $BRANCH $REPO_URL /root/Drishya >/dev/null 2>&1
cd /root/Drishya
echo \"source: \$(git log --oneline -1)\"
"

# --- 2. build -------------------------------------------------------------
#
# Both images, on the box. The API is the slow one: a full Maven package with
# no local repository to start from.

# Reclaim disk BEFORE building, and again after.
#
# The instance has an 8 GB root volume and each deploy writes a fresh ~615 MB
# api image plus a full Maven build cache. Nothing removed the old ones, so
# after enough deploys the build dies inside the container with "No space left
# on device" — reported by Maven, from a layer, which reads as a code problem
# and is not one.
#
# ORDER MATTERS, and it is the whole reason this is two steps rather than one.
# Before the build only the build CACHE and dangling layers go: both are
# rebuildable and neither is the running site. The superseded images are
# removed only AFTER a build has succeeded, because "docker image prune -a"
# before a build that then fails would take the images currently serving the
# site with it, and leave nothing to start.
run_step "Reclaiming disk before the build" 5 "
echo 'before:'
df -h / | tail -1
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
# Container logs grow without bound on a box that is never redeployed cleanly,
# and the api container is chatty: an ETA cycle a minute, for weeks. Truncated
# rather than deleted, so a running container keeps its open file handle.
find /var/lib/docker/containers -name '*-json.log' -exec truncate -s 0 {} + 2>/dev/null || true
journalctl --vacuum-size=50M >/dev/null 2>&1 || true
rm -rf /root/Drishya/Drishya.Backend/target 2>/dev/null || true
echo 'after:'
df -h / | tail -1
"

run_step "Building both images (this is the slow part)" 30 "
set -e
cd /root/Drishya
docker build -t drishya-api:local Drishya.Backend
docker build -t drishya-web:local 'Drishya Frontend/drishya_frontend'
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep drishya | head -5
"

# --- 3. settings ----------------------------------------------------------
#
# /etc/drishya.env is written by the stack's user data, which runs ONCE, at
# first boot. Anything added to the template since then is not on an instance
# that already exists — so the routing and arrival settings have to be appended
# here or the container starts without them and nothing says so.

run_step "Adding the settings user data will not have written" 3 "
set -e
grep -q ROUTING_ENABLED /etc/drishya.env || printf 'ROUTING_ENABLED=true\nROUTING_BASE_URL=https://router.project-osrm.org\nARRIVAL_NOTICE_LEAD_MIN=60\n' >> /etc/drishya.env

# The datasource URL has the same problem as the settings above, and a worse
# consequence. pgjdbc's read timeout is infinite by default, so a connection
# that is alive here and dead at the peer blocks in read() forever, is never
# returned, and five of them wedge a pool of five permanently — the site serves,
# and everything touching the database hangs. socketTimeout is the cure, it
# lives in this URL, and user data wrote this file once at first boot: an
# instance created before the fix keeps the broken URL however many times the
# image is rebuilt on top of it. Rebuilt by splitting on '?' rather than sed,
# because the value contains '&' and the file's other lines contain '=' inside
# a password.
url=\$(grep '^SPRING_DATASOURCE_URL=' /etc/drishya.env | cut -d= -f2-)
if printf %s \"\$url\" | grep -q socketTimeout; then
  echo 'datasource: already has socketTimeout'
else
  grep -v '^SPRING_DATASOURCE_URL=' /etc/drishya.env > /tmp/env.new
  echo \"SPRING_DATASOURCE_URL=\${url%%\\?*}?reWriteBatchedInserts=true&socketTimeout=30&tcpKeepAlive=true&connectTimeout=10\" >> /tmp/env.new
  install -m 600 /tmp/env.new /etc/drishya.env && rm -f /tmp/env.new
  echo 'datasource: socketTimeout added'
fi

grep -c . /etc/drishya.env | xargs echo 'settings lines:'
grep -oE '^[A-Z_]+' /etc/drishya.env | sort
"

# --- 4. run ---------------------------------------------------------------

run_step "Starting the containers on the new images" 5 "
set -e
$MEMORY_SIZING
docker network create drishya 2>/dev/null || true
docker rm -f api web 2>/dev/null || true
# --memory, sized from the host by MEMORY_SIZING in aws/common.sh, and a heap
# sized FROM it rather than beside it.
#
# The instance has 913 MB and runs this JVM, nginx, dockerd and the OS. With an
# -Xmx of 448m plus 128m of metaspace plus JVM overhead, the process alone
# reaches for most of the box; a deploy's own output showed 128 Mi available
# with swap already in use. When it goes over, the KERNEL picks the victim, and
# a machine whose dockerd is being starved cannot restart anything — which is
# why the site has to be recovered with a reboot rather than by itself.
#
# With a limit, Docker enforces it instead: the container is killed, --restart
# always brings it straight back, and the rest of the machine stays responsive.
# MaxRAMPercentage makes the JVM read the cgroup limit rather than guess, so
# the two numbers cannot drift apart the way -Xmx and --memory would.
docker run -d --name api --network drishya --restart always \
  --memory=\$LIM --memory-swap=\$SWP \
  --env-file /etc/drishya.env \
  -e JAVA_TOOL_OPTIONS='-XX:MaxRAMPercentage=60 -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC' \
  drishya-api:local >/dev/null
docker run -d --name web --network drishya --restart always -p 80:80 drishya-web:local >/dev/null
sleep 60
docker ps --format '{{.Names}} {{.Status}}'
echo '--- migrations and startup ---'
docker logs api 2>&1 | grep -iE 'Migrating to version|Successfully applied|Started DrishyaBackend|ERROR' | tail -20
"

# Only now, and the reason is worth stating because getting it wrong took the
# site down.
#
# "docker image prune -a" removes every image NOT USED BY A CONTAINER. It does
# not mean "old". Run between the build and the start — which is where this
# began life — the freshly built drishya-api:local had no container on it yet
# while the PREVIOUS images were protected by the containers still running on
# them, so it deleted exactly the pair that had just been built. The next step
# then found no drishya-api:local, tried to pull it from a registry that has
# never held it, and left the box with no containers at all.
#
# After the start the ownership is the other way round: the new images are in
# use and safe, the superseded ones are unreferenced and are what goes.
run_step "Reclaiming disk now the new images are in use" 5 "
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker images --format '{{.Repository}}:{{.Tag}}' | grep drishya || true
df -h / | tail -1
"

# --- 4b. the watchdog -----------------------------------------------------
#
# The image has declared a HEALTHCHECK all along, and nothing was acting on it.
# Docker's --restart always restarts a container that EXITS; it does nothing
# for one that is running and unhealthy. A JVM that is alive but wedged — out
# of heap and thrashing, or holding a pool of dead connections — therefore
# stays wedged indefinitely, which is exactly the state that has been requiring
# a manual reboot.
#
# This acts on the signal that already exists. Every two minutes: if the health
# status says unhealthy, restart the container and write a line saying so. If
# the container is missing entirely, start it from the image that is already
# there.
#
# The script travels base64 for the same reason the steps do — it is
# alphanumeric, so nothing in it can be mangled by quoting through SSM, the
# JSON parameter and Git Bash. A previous attempt at embedding a shell loop
# with "$f" through those layers silently produced a script that matched
# nothing and reported success.

run_step "Installing the watchdog that acts on the healthcheck" 3 "$WATCHDOG_STEP"

# --- 5. verify ------------------------------------------------------------

if [ -n "$SITE" ]; then
    say "Checking the site"
    for _ in $(seq 1 20); do
        if curl -fsS "$SITE/actuator/health/readiness" >/dev/null 2>&1; then
            echo "readiness: up"
            curl -fsS -XPOST "$SITE/api/auth/demo-login" \
                 -H 'Content-Type: application/json' -d '{"role":"vendor_admin"}' >/dev/null \
                && echo "demo-login: ok" \
                || die "Health is up but demo-login failed. Check: docker logs api"
            cat <<DONE

  Running.

    $SITE

  The images are on this instance only, not in ECR. If the instance is ever
  replaced, run this again — or use aws/deploy-nocdn.sh once your network can
  reach ECR.

  Hard-refresh any browser tab that was open before this deploy: a tab holding
  the old bundle keeps posting simulated positions and will fight the server.

DONE
            exit 0
        fi
        sleep 15
    done
    die "The site did not come up. Look at the container: docker logs api"
fi
