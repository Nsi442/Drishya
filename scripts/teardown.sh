#!/usr/bin/env bash
# Removes the deployed environment when the review is over.
#
# There are two deployments in this repository and they carry very different
# risks, so this script handles both and says which is which.
#
#   AWS  (AWS-DEPLOYMENT.md)  — EC2 and RDS bill by the HOUR, running or idle,
#                               and RDS keeps billing for storage while stopped.
#                               A stopped RDS instance also restarts itself
#                               after seven days. This is the one that costs
#                               money if you forget it.
#
#   Neon / Render / Vercel (DEPLOYMENT.md) — nothing bills by the hour on the
#                               free tier. Tidiness rather than an emergency.
#
# The AWS path IS automated, unlike the three-provider one below. That is not
# inconsistency: deleting a CloudFormation stack is a single scoped call against
# resources this repository created, and the alternative — a human remembering
# to remove seven resources in the right order — is how a database survives its
# own teardown. The three-provider path stays manual because it would need three
# sets of deletion credentials sitting in a script, which is a worse risk than
# the thing it saves.
set -euo pipefail

REGION="${REGION:-${AWS_REGION:-ap-south-1}}"
STACK="${STACK:-drishya}"

usage() {
    cat <<USAGE
Usage:
    scripts/teardown.sh aws        delete the CloudFormation stack
    scripts/teardown.sh providers  print the Neon / Render / Vercel steps

Environment:
    REGION   AWS region        (default: $REGION)
    STACK    stack name        (default: $STACK)
USAGE
}

teardown_aws() {
    command -v aws >/dev/null || { echo "The aws CLI is not on PATH."; exit 1; }

    if ! aws cloudformation describe-stacks --region "$REGION" \
            --stack-name "$STACK" >/dev/null 2>&1; then
        echo "No stack '$STACK' in $REGION. Nothing to do."
        exit 0
    fi

    echo "About to DELETE stack '$STACK' in $REGION."
    echo "This destroys the database and every position in it."
    read -r -p "Type the stack name to confirm: " confirm
    [ "$confirm" = "$STACK" ] || { echo "Not confirmed. Nothing deleted."; exit 1; }

    # The bucket has to be emptied first. CloudFormation will not delete a
    # bucket with objects in it, and the failure leaves the stack in
    # DELETE_FAILED with the database still running beside it — which is
    # precisely the outcome this script exists to prevent.
    bucket=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
        --query "Stacks[0].Outputs[?OutputKey=='BundleBucket'].OutputValue" \
        --output text 2>/dev/null || true)
    if [ -n "$bucket" ] && [ "$bucket" != "None" ]; then
        echo "Emptying s3://$bucket"
        aws s3 rm "s3://$bucket" --recursive --only-show-errors || true
    fi

    aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"
    echo "Delete requested. Waiting — RDS takes a few minutes."
    aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"

    echo
    echo "Stack deleted. Confirm nothing survived:"
    echo "    aws rds describe-db-instances --region $REGION --query 'DBInstances[].DBInstanceIdentifier'"
    echo "    aws ec2 describe-instances --region $REGION \\"
    echo "        --filters Name=instance-state-name,Values=running \\"
    echo "        --query 'Reservations[].Instances[].InstanceId'"
    echo
    echo "Both should be empty of anything named $STACK."
}

teardown_providers() {
    cat <<'STEPS'
Tear down Drishya — Neon / Render / Vercel
==========================================

Deliberately not automated: each step is one console click, and a script
holding three sets of deletion credentials is a worse risk than the thing
it saves.

1. Render   dashboard.render.com
              drishya-api > Settings > Delete Service

2. Vercel   vercel.com/dashboard
              drishya > Settings > Delete Project

3. Neon     console.neon.tech
              drishya > Settings > Delete Project
              (this destroys the database and every position in it)

None of the three bills by the hour on the free tier, so this is tidiness
rather than a cost-control emergency. It still matters: a Neon project left
behind holds real seeded data, and a Render service left behind keeps waking
it up.
STEPS
}

case "${1:-}" in
    aws)       teardown_aws ;;
    providers) teardown_providers ;;
    *)         usage; exit 1 ;;
esac

cat <<'LOCAL'

Local, if you also want the container and its volume gone:

    docker compose down -v

Note the -v. Without it the named volume survives and the next
`docker compose up` comes back with the old data still in place.
LOCAL
