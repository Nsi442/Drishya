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
docker network create drishya 2>/dev/null || true
docker rm -f api web 2>/dev/null || true
docker run -d --name api --network drishya --restart always \
  --env-file /etc/drishya.env \
  -e JAVA_TOOL_OPTIONS='-Xmx448m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC' \
  drishya-api:local >/dev/null
docker run -d --name web --network drishya --restart always -p 80:80 drishya-web:local >/dev/null
sleep 60
docker ps --format '{{.Names}} {{.Status}}'
echo '--- migrations and startup ---'
docker logs api 2>&1 | grep -iE 'Migrating to version|Successfully applied|Started DrishyaBackend|ERROR' | tail -20
"

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
