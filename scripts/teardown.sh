#!/usr/bin/env bash
# Removes the deployed environment when the review is over.
#
# None of these three providers bills by the hour on the free tier, so this is
# tidiness rather than the cost-control emergency an RDS instance would be. It
# still matters: a Neon project left behind holds real seeded data, and a Render
# service left behind keeps waking it up.
#
# Deliberately NOT automated against the provider APIs. Each step below is one
# console click, and a script holding three sets of deletion credentials is a
# worse risk than the thing it saves.
set -euo pipefail

cat <<'STEPS'
Tear down Drishya
=================

1. Render   dashboard.render.com
              drishya-api > Settings > Delete Service

2. Vercel   vercel.com/dashboard
              drishya > Settings > Delete Project

3. Neon     console.neon.tech
              drishya > Settings > Delete Project
              (this destroys the database and every position in it)

Local, if you also want the container and its volume gone:

    docker compose down -v

Note the -v. Without it the named volume survives and the next
`docker compose up` comes back with the old data still in place.
STEPS
