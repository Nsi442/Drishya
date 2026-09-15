#!/usr/bin/env bash
# The watchdog, and the one place it is installed from.
#
# WHY THIS IS ITS OWN FILE. Two scripts install this — aws/rescue.sh and
# aws/build-on-instance.sh — and they each carried their own copy. When Amazon
# Linux 2023 turned out to ship no cron at all, one copy was fixed to use a
# systemd timer and the other was not, so the next deploy failed on exactly the
# error that had just been fixed. Duplicated logic diverges the moment it is
# touched; this is the fix for that, not just for cron.
#
# Sourced, not executed. It defines WATCHDOG_STEP, which the caller hands to its
# own run_step.

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
