#!/usr/bin/env bash
# Shared by aws/rescue.sh and aws/build-on-instance.sh: the watchdog, and the
# container memory sizing. Both were duplicated once and both diverged.
#
# WHY THIS IS ITS OWN FILE. Two scripts install this — aws/rescue.sh and
# aws/build-on-instance.sh — and they each carried their own copy. When Amazon
# Linux 2023 turned out to ship no cron at all, one copy was fixed to use a
# systemd timer and the other was not, so the next deploy failed on exactly the
# error that had just been fixed. Duplicated logic diverges the moment it is
# touched; this is the fix for that, not just for cron.
#
# Sourced, not executed. It defines WATCHDOG_STEP, which the caller hands to its
# own run_step, and MEMORY_SIZING, a fragment those steps embed.

WATCHDOG_B64=$(cat <<'WATCHDOG' | base64 | tr -d '\n'
#!/usr/bin/env bash
# Restarts the Drishya API when its own healthcheck says it is unhealthy.
# Installed by aws/rescue.sh. Run every two minutes by drishya-watchdog.timer.
set -u
LOG=/var/log/drishya-watchdog.log

state=$(docker inspect -f '{{.State.Health.Status}}' api 2>/dev/null || echo missing)
running=$(docker inspect -f '{{.State.Running}}' api 2>/dev/null || echo false)

# Docker's healthcheck is not enough on its own, and this is why.
#
# It probes /actuator/health/readiness every thirty seconds, so that path's
# classes stay loaded and warm. When Metaspace filled, the JVM stayed alive and
# that warm probe kept answering — Docker reported healthy, OOMKilled was false
# and the restart count was zero — while every request that needed to load a
# new class died with OutOfMemoryError and nginx timed out after sixty seconds.
# Alive but wedged, which is the exact case this watchdog exists for, invisible
# to the signal it was reading.
#
# So probe the site the way a person reaches it: through nginx, from the host,
# with a short deadline. Two consecutive failures, to avoid restarting on one
# slow moment.
#
# The path must be one that ANSWERS. The first version probed /api/health,
# which no controller serves and Spring Security does not permit, so -f saw a
# 401 and treated a perfectly healthy site as dead — a watchdog that restarts
# the API every two minutes for ever. /actuator/health is the permitted one,
# nginx has a location for it, and it is not the path Docker's own healthcheck
# keeps warm (that is /actuator/health/readiness, from inside the container),
# so it still exercises nginx, the host network and a class load.
probe() { curl -fsS --max-time 8 -o /dev/null http://localhost/actuator/health 2>/dev/null; }
if [ "$state" = healthy ] && [ "$running" = true ]; then
  if ! probe && ! probe; then
    echo "$(date -Is) docker says healthy but the site does not answer; restarting" >> "$LOG"
    free -m | sed -n '2p' >> "$LOG"
    docker logs --tail 5 api 2>&1 | grep -i "OutOfMemoryError" >> "$LOG" || true
    docker restart api >/dev/null 2>&1 || true
    exit 0
  fi
fi

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

WATCHDOG_STEP="
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
fi"

# --- container memory ------------------------------------------------------
#
# Sized from the host rather than hard-coded, and shared for the same reason the
# watchdog is. build-on-instance.sh carried its own 700m, written when the only
# box was a t3.micro. Run against the t3.small the stack is on now it gave the
# JVM a 420 MB heap and silently undid the 1000m rescue.sh had just set — a
# rebuild quietly downgrading the machine it had just finished deploying to.
#
# Emits LIM and SWP. Embedded inside a run_step string, so the dollars are
# escaped for the heredoc that carries it.
# The JVM flags, shared for the same reason the sizing is.
#
# Metaspace at 128m was too small for this stack — Spring Boot 4, Hibernate 7,
# Jackson 3, springdoc and ONNX Runtime — and it filled after about half an hour
# of use, wedging the API without exiting. The heap percentage comes down to
# make room inside the same container limit: 50% of 1000m is a 500m heap, plus
# 256m of metaspace, plus overhead, still fits.
#
# ExitOnOutOfMemoryError is the important one. A JVM that stays alive after an
# OutOfMemoryError is the state nothing could see: Docker healthy, OOMKilled
# false, restarts zero, and every real request timing out. Exiting makes
# --restart always do its job and turns an invisible wedge into a restart.
JVM_OPTS='-XX:MaxRAMPercentage=50 -XX:MaxMetaspaceSize=256m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError'

MEMORY_SIZING='
TOTAL=$(free -m | awk "/^Mem:/{print \$2}")
if [ "$TOTAL" -ge 1500 ]; then LIM=1000m; SWP=2000m; else LIM=700m; SWP=1400m; fi
echo "host memory: ${TOTAL}m -> container limit $LIM"
'
