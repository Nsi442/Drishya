# Deploying Drishya on AWS

One CloudFormation stack. Everything in it is in
[`aws/drishya.cfn.yaml`](aws/drishya.cfn.yaml), and one `delete-stack` removes
all of it.

> **This is the alternative to [`DEPLOYMENT.md`](DEPLOYMENT.md), not an addition
> to it.** That one puts the database on Neon, the API on Render and the bundle
> on Vercel, none of which bills by the hour. This one bills by the hour. Read
> [Cost](#cost-read-this-one) before you start.

| Layer | Here | Why |
|---|---|---|
| Database | RDS PostgreSQL **16.10**, `db.t4g.micro` | PostGIS is available; major pinned to 16 to match `docker-compose.yml` |
| API | EC2 `t3.micro`, the container from `Drishya.Backend/Dockerfile` | The documented target in `CLAUDE.md` |
| Bundle | S3, private | Served only through CloudFront |
| TLS + routing | One CloudFront distribution | Free certificate, per-request billing, no load balancer |

---

## The shape, and why it is this shape

```
                    browser
                       │  HTTPS
                       ▼
        ┌──────── CloudFront distribution ────────┐
        │                                          │
   default behaviour                        /api/*  ·  /actuator/*
        │                                          │
        ▼                                          ▼
   S3 bucket (private, OAC)              EC2 t3.micro  :8080
   the Vite bundle                        drishya-api container
                                                   │
                                                   ▼
                                          RDS db.t4g.micro
                                          Postgres 16 + PostGIS
```

**No load balancer.** `CLAUDE.md` rules an ALB out because it bills hourly
whether or not anything uses it, and with a single instance there is no
health-based routing to do. But HTTPS is not optional here: browser geolocation
refuses to run outside a secure context, so `source: BROWSER` positions only
exist on a secure origin, and an HTTPS page calling an HTTP API is blocked
outright as mixed content. CloudFront gives TLS on its own domain for free and
bills per request.

**One distribution, not two.** The bundle and the API answer on the same origin,
so the browser never makes a cross-origin request and **CORS never enters into
it** — the same reason the Vite proxy exists locally. `DEPLOYMENT.md` names CORS
as the first thing that breaks on a split deploy; this removes the category.
`VITE_API_BASE` stays at its default `/api` and the bundle is not rebuilt per
environment.

**No NAT gateway.** The instance is in a public subnet and reaches ECR directly.
A NAT gateway is the most expensive thing people leave running by accident.

**Port 8080 is not open to the internet.** The instance's security group admits
only AWS's managed CloudFront prefix list, so the TLS the distribution provides
cannot be walked around by hitting the instance directly.

**SPA routing is a CloudFront Function, not `CustomErrorResponses`.** The obvious
way is wrong here: custom error responses are distribution-wide, so they would
also turn the API's 404s into `index.html` with status 200. This API answers 404
rather than 403 for another tenant's record *on purpose* — rewriting that to a
200 breaks both the tenancy contract and the frontend's error handling. The
function is attached to the bundle behaviour only, and leaves any path
containing a dot alone so a missing JS chunk still 404s instead of returning
HTML and producing `Unexpected token '<'`.

---

## Cost, read this one

**Unlike the Neon/Render/Vercel path, this bills by the hour and does not stop
on its own.** EC2 and RDS both charge for every hour they exist, running or
idle, and RDS keeps charging for storage even when the instance is stopped —
and a stopped RDS instance restarts itself after 7 days.

| Resource | Free tier (new accounts, 12 months) | After that, roughly |
|---|---|---|
| EC2 `t3.micro` | 750 h/month | ~$7.50/month |
| RDS `db.t4g.micro` | 750 h/month | ~$12/month |
| 20 GB gp3 storage ×2 | 20–30 GB included | ~$4/month |
| CloudFront | 1 TB out, 10M requests — **perpetual**, not 12 months | pennies at this traffic |
| S3, ECR | negligible | negligible |

Two things worth doing before you deploy:

1. **Set a budget alarm.** Billing → Budgets → a $5 monthly budget with an email
   alert. This is the whole safety net.
2. **Know the teardown command** before you need it — it is at the bottom of
   this file, and `scripts/teardown.sh` prints it.

---

## Running it for a few weeks

**Do not stop the instance to save money.** CloudFront reaches the API at the
instance's public DNS name, and that name is derived from its public IP — which
AWS releases on stop and reassigns on start. Stop and start it and the
distribution is left pointing at a host that no longer exists: the bundle keeps
loading, every API call fails, and nothing in the console looks wrong. A
**reboot** is fine; the address survives it. If you do stop it, update the
`api-instance` origin's domain name in the distribution to the new one.

It is also a false economy. Three weeks of a `t3.micro` is about **$5**, and
stopping it between demos might save half of that.

The database is the same story in reverse: a stopped RDS instance keeps billing
for its storage and **restarts itself after seven days**, so stopping it saves
almost nothing and quietly comes back.

**Put the teardown date in your calendar now, not at the end.** Three weeks of
the whole stack is roughly $17, which any credit covers — the risk is not the
three weeks, it is month four, when nobody is looking and the credits have run
out. `scripts/teardown.sh aws` is one command and takes a few minutes.

---

## Prerequisites

- An AWS account, and `aws` CLI v2 configured (`aws sts get-caller-identity`
  should print your account).
- Docker, to build and push the API image.
- Node 22 and Java 21 only if you want to build locally rather than in CI.
- A region. `ap-south-1` (Mumbai) suits the Indian lanes this data describes;
  anything works. Every command below assumes `$REGION` is set.

```bash
export REGION=ap-south-1
export STACK=drishya
```

---

## 1. Look up the CloudFront prefix list

It is owned by AWS, differs per region, and cannot be created by the template —
so it is passed in.

```bash
export PL=$(aws ec2 describe-managed-prefix-lists --region "$REGION" \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)
echo "$PL"   # pl-xxxxxxxx
```

## 2. Generate the two secrets

```bash
export DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/@" ' | cut -c1-32)
export JWT_SECRET=$(openssl rand -base64 48)
```

**`JWT_SECRET` is not optional.** Left unset, the application generates a random
key on every boot, which signs every user out on every restart and deploy — and
it logs a warning saying exactly that. Shorter than 32 characters and it refuses
to start rather than pad it.

Keep both somewhere you can find them again; the stack does not show them back.

## 3. Deploy the stack

```bash
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file aws/drishya.cfn.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DbPassword="$DB_PASSWORD" \
      JwtSecret="$JWT_SECRET" \
      CloudFrontPrefixListId="$PL"
```

Fifteen to twenty minutes, most of it RDS and the CloudFront distribution.

The instance boots before there is an image to run and **waits for one**, so
step 3 and step 5 can happen in either order.

Collect the outputs:

```bash
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output table
```

## 4. Enable PostGIS

The database is not reachable from the internet by design, so run this from the
instance — the only thing its security group admits. No SSH key needed:

```bash
INSTANCE=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

aws ssm start-session --region "$REGION" --target "$INSTANCE"
```

Then, on the instance:

```bash
sudo dnf install -y postgresql16
psql "postgresql://drishya:PASSWORD@DB_ENDPOINT:5432/drishya" -f - <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';
SQL
```

The full script, with the verification query that proves the geography type
actually works, is [`db/rds-setup.sql`](db/rds-setup.sql). **If the extension
query returns no rows, stop** — every geofence check and lane calculation in
this system is a PostGIS query, and Flyway's V2 will not even parse without the
geography type.

## 5. Build and push the API image

```bash
ECR=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepository'].OutputValue" --output text)

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ECR%%/*}"

docker build -t "$ECR:latest" Drishya.Backend
docker push "$ECR:latest"
```

Build on your own machine, not on the instance: a Maven build inside a container
on 1 GB of RAM is a coin toss, and losing it gives you an OOM-killed process
rather than a compile error.

The instance picks the image up within about 30 seconds of the push on a first
deploy. For a **later** deploy it is already running the old one, so tell it:

```bash
aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["docker pull '"$ECR"':latest","docker rm -f drishya-api","systemctl restart docker"]'
```

Simpler, if you would rather not think about it: `aws ec2 reboot-instances` and
let user data run again.

## 6. Build and upload the bundle

```bash
BUCKET=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='BundleBucket'].OutputValue" --output text)
DIST=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

cd "Drishya Frontend/drishya_frontend"
npm ci && npm run build
```

**No `VITE_API_BASE`.** It defaults to `/api`, which is correct here because the
API is on the same origin. Setting it to an absolute URL would reintroduce the
cross-origin request this architecture exists to avoid.

```bash
# Fingerprinted assets first, cached hard.
aws s3 sync dist/ "s3://$BUCKET/" --delete \
  --exclude index.html --cache-control "public,max-age=31536000,immutable"

# index.html last and uncached — it is what points at the new fingerprints.
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/"
```

## 7. Verify

```bash
SITE=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)

curl -fsS "$SITE/actuator/health/readiness"     # {"status":"UP"}
curl -fsS -XPOST "$SITE/api/auth/demo-login" \
     -H 'Content-Type: application/json' -d '{"role":"vendor_admin"}'
```

Then open `$SITE` and sign in as `priya@anandauto.example` / `drishya`.

The point is not that the pages load — it is that a position posted to the
hosted API appears on the hosted map. Run the simulator against it:

```bash
python simulator/simulate.py --shipment SHP-24025 --api-url "$SITE" --time-scale 120
```

Or, now that the button exists, book a consignment in the vendor portal and
press **Start trip** — the server drives it with nothing open.

---

## When it does not work

| Symptom | Cause |
|---|---|
| Site loads, every API call 502 | The container is not running. `aws ssm start-session`, then `docker logs drishya-api`. |
| API 500s on every request at boot | PostGIS was never enabled — step 4. Flyway fails and the app starts with no schema. |
| `curl` to the instance's own IP times out | Correct. Only CloudFront may reach 8080. |
| Everyone signed out after a deploy | `JWT_SECRET` was not passed. Redeploy with it. |
| A hard refresh on `/vendor/shipments` 404s | The CloudFront Function is not attached to the default behaviour. |
| Blank page, `Unexpected token '<'` in the console | A JS chunk 404'd and was rewritten to `index.html`. The function leaves dotted paths alone — check the S3 sync actually uploaded `assets/`. |
| Stack stuck in `DELETE_FAILED` | Almost always a non-empty S3 bucket. Empty it, delete again. |

**On secrets:** `cfn-lint` warns (`W1011`) that the database password and JWT
secret are template parameters rather than Secrets Manager references. That is a
deliberate trade — Secrets Manager is $0.40 per secret per month, and two
secrets is most of this project's monthly bill. They reach the instance through
user data, so they are readable from instance metadata; the template requires
IMDSv2 so an SSRF in the application is not enough to read them. For anything
handling real consignments, move them to Secrets Manager.

---

## Teardown

**Do this when the review is over.** One command removes everything, including
the database and every position in it.

```bash
aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"
```

The S3 bucket must be empty first, or the delete fails on it:

```bash
aws s3 rm "s3://$BUCKET" --recursive
```

The ECR repository empties itself (`EmptyOnDelete`), the RDS instance takes no
final snapshot, and deletion protection is off — all three deliberately, so that
the teardown actually completes rather than leaving a billable thing behind
while reporting success.

`scripts/teardown.sh` prints this sequence with your stack's values filled in.
