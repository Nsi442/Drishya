#!/usr/bin/env bash
# Why is a booking still drawing a straight line?
#
#   ./aws/diagnose-routing.sh
#
# RoutePlanner falls back to the drawn curve on ANY failure, deliberately: a
# booking must not depend on a third party being awake. The cost of that choice
# is that a router which never answers looks exactly like one that was never
# configured — the consignment is created either way and nothing on screen says
# which happened.
#
# This asks the instance three questions in the order that narrows it fastest:
# is routing switched on, can the box resolve and reach the router at all, and
# what did the application actually say when it tried.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
STACK="${STACK:-drishya}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || die "aws CLI not found."

INSTANCE="${INSTANCE:-$(aws cloudformation describe-stacks --region "$REGION" \
    --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text 2>/dev/null)}"
[ -n "$INSTANCE" ] && [ "$INSTANCE" != "None" ] || die "Could not find the instance id."
echo "instance: $INSTANCE"

script='
echo "=== 1. is routing switched on? ==="
grep -E "^ROUTING" /etc/drishya.env || echo "NO ROUTING SETTINGS IN /etc/drishya.env"
echo
echo "=== 2. can the container itself reach the router? ==="
docker exec api sh -c "getent hosts router.project-osrm.org || echo DNS-FAILED" 2>&1 | head -2
echo "--- a real request, timed (the app allows 3s to connect, 6s to read) ---"
docker exec api sh -c "curl -s -o /dev/null -w \"http=%{http_code} dns=%{time_namelookup}s connect=%{time_connect}s total=%{time_total}s\n\" --max-time 25 \"https://router.project-osrm.org/route/v1/driving/73.8567,18.5204;73.0631,19.2967?overview=simplified&geometries=geojson\"" 2>&1 | head -3
echo
echo "=== 2b. what the server does with each encoding ==="
U="https://router.project-osrm.org/route/v1/driving/73.8567,18.5204;73.0631,19.2967?overview=simplified&geometries=geojson"
for enc in gzip identity; do
  docker exec api sh -c "curl -s -D /tmp/h -o /tmp/b -H 'Accept-Encoding: $enc' \"$U\" 2>/dev/null; \
    printf '  Accept-Encoding: %-9s -> ' '$enc'; \
    ce=\$(grep -i '^content-encoding:' /tmp/h | tr -d '\r' | cut -d' ' -f2-); \
    printf 'Content-Encoding: %s | ' \"\${ce:-none}\"; \
    magic=\$(od -An -tx1 -N2 /tmp/b | tr -d ' '); \
    if [ \"\$magic\" = '1f8b' ]; then echo 'body IS gzip'; \
    elif [ \"\$(head -c1 /tmp/b)\" = '{' ]; then echo 'body is plain JSON'; \
    else echo \"body starts \$magic\"; fi" 2>&1 | head -2
done
echo "  A reply labelled gzip whose body is plain JSON is the bug: something"
echo "  inflates by the header and the body was already decompressed."

echo
echo "=== 3. what did the application say? ==="
docker logs api 2>&1 | grep -iE "Routing failed|Router returned|Routed .* km" | tail -10
if ! docker logs api 2>&1 | grep -qiE "Routing failed|Router returned|Routed "; then
  echo "NOTHING LOGGED — RoutePlanner never ran. Either no consignment has been"
  echo "booked since this container started, or routing is disabled."
fi
'

b64=$(printf '%s' "$script" | base64 | tr -d '\n')
id=$(aws ssm send-command --region "$REGION" \
        --instance-ids "$INSTANCE" \
        --document-name AWS-RunShellScript \
        --comment "Diagnose routing" \
        --parameters commands="[\"echo $b64 | base64 -d > /tmp/diag.sh\",\"bash /tmp/diag.sh\"]" \
        --query 'Command.CommandId' --output text)

say "Asking the instance"
for _ in $(seq 1 18); do
    sleep 10
    status=$(aws ssm get-command-invocation --region "$REGION" \
                --command-id "$id" --instance-id "$INSTANCE" \
                --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Success|Failed|Cancelled|TimedOut) break ;; *) printf '.' ;; esac
done
echo
aws ssm get-command-invocation --region "$REGION" \
    --command-id "$id" --instance-id "$INSTANCE" \
    --query StandardOutputContent --output text

cat <<'READ'

--- how to read this ---

  "Routed NNN km over N points"   routing works; the straight line you are
                                  looking at is an OLD consignment. Run the
                                  backfill to convert the rest.

  "Routing failed (ResourceAccessException)"
                                  the request never completed. If the timed
                                  curl above took longer than 6s, the read
                                  timeout is simply too short from ap-south-1 —
                                  raise ROUTING_READ_TIMEOUT_MS.

  http=000 or DNS-FAILED          the instance cannot reach the router at all.
                                  Leave ROUTING_ENABLED=true; every booking
                                  falls back to the drawn curve, which is the
                                  behaviour this was designed to have.

  http=200 but "Routing failed"   the router answered and the client rejected
                                  it — check for "implausible" in the log.

READ
