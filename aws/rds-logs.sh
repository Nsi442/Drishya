#!/usr/bin/env bash
#
# Turn on statement logging in RDS, follow the log live, and turn it back off.
#
#   ./aws/rds-logs.sh tunnel     # print the SSM port-forward command
#   ./aws/rds-logs.sh enable     # log every statement (REBOOTS the database)
#   ./aws/rds-logs.sh tail       # follow the log, like tail -f
#   ./aws/rds-logs.sh activity   # what the database is doing right now
#   ./aws/rds-logs.sh disable    # back to logging nothing (REBOOTS)
#
# WHY A CUSTOM PARAMETER GROUP IS NEEDED
# The stack creates the instance on the DEFAULT parameter group, and AWS does
# not allow the default group to be modified -- by anyone, ever. So "make RDS
# log the inserts" is not a setting to flip, it is a group to create, a
# parameter to set, an instance to modify and a reboot to wait through. That is
# roughly four minutes, and the reboot is not optional: log_statement is static
# in the sense that RDS applies it as pending-reboot on attach.
#
# WHY LOGGING EVERY STATEMENT IS A DEMO SETTING AND NOT A PRODUCTION ONE
# log_statement=all writes one line per statement. The feeder inserts a hundred
# rows a tick, the application's own ETA cycle runs every minute, and a
# db.t4g.micro has 20 GB of gp3 under it that the log shares with the data.
# Leave it on for the demonstration, turn it off after. `disable` exists for
# exactly that reason and is not an afterthought.

set -euo pipefail

STACK="${STACK:-drishya}"
REGION="${REGION:-ap-south-1}"
PG_GROUP="${STACK}-pg16-verbose"
LOGFILE="error/postgresql.log"

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: $1 is not installed." >&2; exit 1; }; }
need aws

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}

DB_ID="${STACK}-db"

usage() { sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd_tunnel() {
  local instance endpoint
  instance="$(stack_output InstanceId)"
  endpoint="$(stack_output DbEndpoint)"
  if [ -z "$instance" ] || [ "$instance" = "None" ]; then
    echo "error: could not read InstanceId from stack '$STACK' in $REGION." >&2
    exit 1
  fi

  cat <<TUNNEL
Run this in a SEPARATE terminal and leave it open:

aws ssm start-session \\
  --target $instance \\
  --region $REGION \\
  --document-name AWS-StartPortForwardingSessionToRemoteHost \\
  --parameters '{"host":["$endpoint"],"portNumber":["5432"],"localPortNumber":["5432"]}'

It needs the Session Manager plugin, which is a separate install from the AWS
CLI. On Windows, download and run:
  https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPlugin.zip
Then reopen the terminal so PATH picks it up.

While it is open, the database is on localhost:5432:

  export PGPASSWORD=<DbPassword from .aws-secrets.env>
  psql -h localhost -U drishya -d drishya
  python Drishya.Backend/scripts/csv-rds-feeder.py --shipment SHP-... --csv lane.csv

Closing that terminal closes the route. Nothing is left exposed.
TUNNEL
}

cmd_enable() {
  if ! aws rds describe-db-parameter-groups --db-parameter-group-name "$PG_GROUP" \
       --region "$REGION" >/dev/null 2>&1; then
    echo "Creating parameter group $PG_GROUP..."
    aws rds create-db-parameter-group \
      --db-parameter-group-name "$PG_GROUP" \
      --db-parameter-group-family postgres16 \
      --description "Drishya: statement logging for the telemetry demonstration" \
      --region "$REGION" >/dev/null
  fi

  echo "Setting log parameters..."
  # log_statement=all is the one that matters. The other two make each line
  # readable on its own: without log_line_prefix a log entry says what ran but
  # not when, by whom, or in which transaction, which makes it useless as
  # evidence that rows arrived continuously rather than in one burst.
  aws rds modify-db-parameter-group \
    --db-parameter-group-name "$PG_GROUP" \
    --region "$REGION" \
    --parameters \
      "ParameterName=log_statement,ParameterValue=all,ApplyMethod=immediate" \
      "ParameterName=log_min_duration_statement,ParameterValue=0,ApplyMethod=immediate" \
      "ParameterName=log_line_prefix,ParameterValue=%t:%r:%u@%d:[%p]:,ApplyMethod=immediate" \
    >/dev/null

  local current
  current="$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
    --region "$REGION" \
    --query 'DBInstances[0].DBParameterGroups[0].DBParameterGroupName' --output text)"

  if [ "$current" != "$PG_GROUP" ]; then
    echo "Attaching $PG_GROUP to $DB_ID (this requires a reboot)..."
    aws rds modify-db-instance --db-instance-identifier "$DB_ID" \
      --db-parameter-group-name "$PG_GROUP" --apply-immediately \
      --region "$REGION" >/dev/null
    echo "Waiting for the modification to settle..."
    aws rds wait db-instance-available --db-instance-identifier "$DB_ID" --region "$REGION"
    echo "Rebooting $DB_ID..."
    aws rds reboot-db-instance --db-instance-identifier "$DB_ID" --region "$REGION" >/dev/null
    aws rds wait db-instance-available --db-instance-identifier "$DB_ID" --region "$REGION"
    echo
    echo "The API container held connections that the reboot dropped. Hikari"
    echo "reconnects on its own, but if the site 500s, restart it:"
    echo "  aws ssm start-session --target $(stack_output InstanceId) --region $REGION"
    echo "  sudo docker restart api"
  else
    echo "$PG_GROUP is already attached; parameters updated in place."
  fi

  echo
  echo "Statement logging is on. Follow it with:  $0 tail"
  echo "Turn it OFF when the demonstration is done:  $0 disable"
}

cmd_disable() {
  echo "Setting log_statement back to none..."
  aws rds modify-db-parameter-group \
    --db-parameter-group-name "$PG_GROUP" \
    --region "$REGION" \
    --parameters \
      "ParameterName=log_statement,ParameterValue=none,ApplyMethod=immediate" \
      "ParameterName=log_min_duration_statement,ParameterValue=-1,ApplyMethod=immediate" \
    >/dev/null
  echo "Done. The parameter group stays attached; only the logging is off."
  echo "That avoids a second reboot, and 'enable' turns it back on immediately."
}

cmd_activity() {
  cat <<'ACTIVITY'
Run this against the tunnel, in psql, while the feeder is running.
It is the live view -- what the database is executing at this instant.

  SELECT pid, state, now() - query_start AS running_for,
         left(query, 90) AS query
    FROM pg_stat_activity
   WHERE datname = 'drishya' AND state <> 'idle'
   ORDER BY query_start;

And the count that proves rows are still arriving, run twice a few seconds apart:

  SELECT trip_id, count(*), max(received_at)
    FROM positions GROUP BY trip_id ORDER BY max(received_at) DESC LIMIT 5;
ACTIVITY
}

cmd_tail() {
  echo "Following $LOGFILE on $DB_ID. Ctrl-C to stop."
  echo "Rows are written by the feeder; if nothing appears, check it is running"
  echo "and that 'enable' has been run."
  echo
  local marker="0"
  while true; do
    # download-db-log-file-portion returns a marker to resume from, which is
    # what makes this a tail rather than a repeated dump of the same lines.
    local out
    out="$(aws rds download-db-log-file-portion \
             --db-instance-identifier "$DB_ID" \
             --log-file-name "$LOGFILE" \
             --marker "$marker" \
             --region "$REGION" \
             --output json 2>/dev/null)" || { sleep 5; continue; }

    local data
    data="$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("LogFileData") or "", end="")')"
    [ -n "$data" ] && printf '%s' "$data"
    marker="$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Marker") or "0")')"
    sleep 3
  done
}

case "${1:-}" in
  tunnel)   cmd_tunnel ;;
  enable)   cmd_enable ;;
  disable)  cmd_disable ;;
  tail)     cmd_tail ;;
  activity) cmd_activity ;;
  *)        usage ;;
esac
