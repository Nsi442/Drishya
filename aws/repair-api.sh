#!/usr/bin/env bash
# Brings the API back when everything that touches the database hangs.
#
#   ./aws/repair-api.sh
#
# THE SYMPTOM. The site serves, /v3/api-docs answers in half a second, and
# every endpoint that reads the database hangs until the client gives up. The
# JVM is healthy; its connections are not.
#
# THE CAUSE. pgjdbc's default read timeout is infinite. A connection that is
# alive from this side but dead at the peer — an RDS failover, a NAT idle
# timeout, a reboot in the wrong order — blocks in read() forever. It is never
# returned to the pool, so five of them wedge a pool of five permanently, and
# nothing times out to make it visible. The cure is socketTimeout, which puts a
# ceiling on how long a query may wait for bytes that are never coming.
#
# WHY IT COMES BACK. The fix lives in SPRING_DATASOURCE_URL, and that is
# written into /etc/drishya.env by the stack's user data — which runs ONCE, at
# first boot. Updating the template does nothing to an instance that already
# exists. So an instance created before the fix keeps the broken URL for its
# whole life, however many times the image is rebuilt on top of it.
#
# This repairs the file in place and restarts the container. Two minutes,
# against twenty-five for a rebuild that would not have fixed it anyway.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
STACK="${STACK:-drishya}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || die "aws CLI not found."

INSTANCE="${INSTANCE:-$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text 2>/dev/null)}"
SITE=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>/dev/null || echo '')
[ -n "$INSTANCE" ] && [ "$INSTANCE" != "None" ] || die "Could not find the instance id."
echo "instance: $INSTANCE"

# Rebuilt by splitting on "?" rather than edited with sed: the value contains
# "&", which sed would expand as the whole match, and the file's other lines
# contain "=" inside a password. Neither survives a naive substitution.
remote='
set -e
echo "=== containers ==="
docker ps -a --format "{{.Names}} {{.Status}}" | grep -E "^(api|web)" || echo "NO CONTAINERS"

echo
echo "=== datasource url, before ==="
url=$(grep "^SPRING_DATASOURCE_URL=" /etc/drishya.env | cut -d= -f2-)
echo "${url%%\?*}?${url#*\?}" | sed "s/^/  /"

if printf %s "$url" | grep -q "socketTimeout"; then
  echo "  already has socketTimeout — the wedge is something else"
  NEEDED=no
else
  base=${url%%\?*}
  new="$base?reWriteBatchedInserts=true&socketTimeout=30&tcpKeepAlive=true&connectTimeout=10"
  grep -v "^SPRING_DATASOURCE_URL=" /etc/drishya.env > /tmp/env.new
  echo "SPRING_DATASOURCE_URL=$new" >> /tmp/env.new
  install -m 600 /tmp/env.new /etc/drishya.env
  rm -f /tmp/env.new
  echo "  rewritten with socketTimeout=30, tcpKeepAlive, connectTimeout=10"
  NEEDED=yes
fi

echo
echo "=== restarting the api ==="
# Recreated rather than restarted: --env-file is read when the container is
# created, so a restart would keep the old environment and change nothing.
docker rm -f api >/dev/null 2>&1 || true
IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "drishya-api" | head -1)
echo "  image: $IMAGE"
docker run -d --name api --network drishya --restart always \
  --env-file /etc/drishya.env \
  -e JAVA_TOOL_OPTIONS="-Xmx448m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC" \
  "$IMAGE" >/dev/null
sleep 50
docker ps --format "{{.Names}} {{.Status}}" | grep api
echo
docker logs api 2>&1 | grep -iE "Started DrishyaBackend|ERROR|Exception" | tail -5
'

b64=$(printf '%s' "$remote" | base64 | tr -d '\n')
id=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" \
        --document-name AWS-RunShellScript --comment "Repair API datasource" \
        --parameters commands="[\"echo $b64 | base64 -d > /tmp/repair.sh\",\"bash /tmp/repair.sh\"]" \
        --query 'Command.CommandId' --output text)

say "Repairing"
for _ in $(seq 1 24); do
    sleep 10
    status=$(aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
                --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Success|Failed|Cancelled|TimedOut) break ;; *) printf '.' ;; esac
done
echo
aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
    --instance-id "$INSTANCE" --query StandardOutputContent --output text
[ "$status" = "Success" ] || aws ssm get-command-invocation --region "$REGION" \
    --command-id "$id" --instance-id "$INSTANCE" --query StandardErrorContent --output text >&2

if [ -n "$SITE" ]; then
    say "Checking the site"
    for _ in $(seq 1 12); do
        if curl -fsS --max-time 10 "$SITE/actuator/health/readiness" >/dev/null 2>&1; then
            echo "readiness: up"
            curl -fsS --max-time 10 -XPOST "$SITE/api/auth/demo-login" \
                 -H 'Content-Type: application/json' -d '{"role":"vendor_admin"}' >/dev/null \
                && { echo "demo-login: ok"; echo; echo "  Back up: $SITE"; exit 0; }
        fi
        sleep 10
    done
    die "Still not answering. Look at: docker logs api"
fi
