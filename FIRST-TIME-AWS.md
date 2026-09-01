# First time with AWS

Everything to do **once**, before [`AWS-DEPLOYMENT.md`](AWS-DEPLOYMENT.md) makes
sense. That file opens with "an AWS account, and `aws` CLI v2 configured", which
is one bullet hiding about an hour. This is the hour.

Allow **60–90 minutes** for this page, then about **25 minutes** for the deploy
itself. Do them on the same day if you can — the tokens and terminal state carry
over.

> AWS moves its console around. Button names and menu positions here are
> approximate; the **names of the things** are exact. When a step does not match
> what you see, search the console's top search bar for the service name in bold
> rather than hunting through menus.

---

## Step 1 — Create the account (~15 min)

Go to **aws.amazon.com** and choose *Create an AWS Account*.

You will need:

- **An email address not already used for an AWS account.** This becomes your
  *root user*, and it cannot be changed easily. Use one you will still read in
  six months.
- **A credit or debit card.** Required even though you have credits and even
  though you will spend nothing. AWS places a small temporary authorisation
  (around $1) to verify the card and reverses it.
- **A phone number** for verification, by SMS or automated call.

Choose the **Basic support plan** — free. The paid ones start at $29/month and
you do not need one.

### Immediately after: turn on MFA for the root user

Do this now, not later. Your root user can close the account, change the card,
and see every bill; a password alone is not enough for that.

**IAM → Security credentials → Multi-factor authentication → Assign MFA device**,
and use a phone authenticator app (Google Authenticator, Authy, or your password
manager if it supports TOTP).

Then **stop using the root user.** It is for billing and account settings only.
Step 3 creates the account you will actually work as.

---

## Step 2 — Find your credits and set a budget (~10 min)

### Check the credits are actually there

**Billing and Cost Management → Credits.**

You should see your $100. Note two things about each credit shown:

- **Its expiry date.** AWS promotional credits always have one.
- **Any restriction.** Some credits only apply to particular services or
  regions. EC2, RDS, S3 and CloudFront are all mainstream, so general credits
  cover them — but read the restriction column if there is one.

**Credits apply going forward, not backwards.** If you deploy today and the
credits land next week, today's usage bills to your card. Do not start the
deploy until you can see them on this page.

### Set a budget alarm

**Billing and Cost Management → Budgets → Create budget.** Use the *Monthly cost
budget* template, set **$5**, and put your email in.

Five dollars is deliberately low. This deployment costs about $17 over three
weeks, so the alarm *will* fire — that is the point. It is not there to tell you
the bill is large; it is there to tell you the meter is running, which is the
fact people forget. If you never see it, something is wrong with the alarm.

### Find out what happens when the credits run out

Worth five minutes on the **Billing → Account settings / Payment preferences**
pages. Some AWS account plans suspend when credits are exhausted; others carry
straight on billing the card with no interruption. Which one you have decides
whether forgetting this deployment costs you nothing or costs you ~$24 a month
silently. If you cannot tell, assume the second and rely on the budget alarm.

---

## Step 3 — Make a user that is not root (~10 min)

You need an access key for the CLI, and it must not be the root user's.

**IAM → Users → Create user**

1. Name it something like `drishya-deploy`.
2. Do **not** tick "provide user access to the console" — this identity is only
   for the command line.
3. **Set permissions → Attach policies directly → `AdministratorAccess`.**

   A narrower policy would be better practice, and for a three-week project it
   is not worth the afternoon: this stack touches CloudFormation, EC2, RDS, S3,
   CloudFront, ECR, IAM and SSM, and assembling the minimal policy across all
   eight is genuinely fiddly. `AdministratorAccess` on a user you delete
   afterwards is the reasonable trade. **Do not** give this key to anyone or
   commit it anywhere.

4. Create the user, then open it → **Security credentials → Create access key**.
5. Choose the **Command Line Interface (CLI)** use case, acknowledge the
   warning, and create.

You now see an **Access key ID** and a **Secret access key**.

> **The secret is shown exactly once.** Copy both somewhere safe before leaving
> the page. If you lose the secret you cannot recover it — you delete the key
> and make a new one, which is a minor annoyance, not a disaster.

---

## Step 4 — Install the tools (~15 min)

You need three things. You may already have two of them, since this project
builds with them.

Check what you have:

```bash
aws --version      # want aws-cli/2.x
docker --version   # want 20+ , and the daemon running
node --version     # want v22
```

### AWS CLI v2

- **macOS:** `brew install awscli`
- **Windows:** download the MSI installer from
  `awscli.amazonaws.com/AWSCLIV2.msi` and run it
- **Linux:** follow the "Linux" tab of AWS's *Install or update the AWS CLI*
  docs — it is a zip, not a package manager install

**Version 2, not 1.** `pip install awscli` gives you version 1, which is old and
missing commands this deploy uses.

### Docker

Docker Desktop on macOS or Windows; Docker Engine on Linux. **It must actually
be running** — `docker ps` should print a table, not an error. On macOS and
Windows that means the Docker Desktop app is open.

### Node 22

From nodejs.org, or `brew install node@22`, or nvm.

---

## Step 5 — Connect the CLI to your account (~5 min)

```bash
aws configure
```

It asks four things:

| Prompt | What to type |
|---|---|
| AWS Access Key ID | the key ID from step 3 |
| AWS Secret Access Key | the secret from step 3 |
| Default region name | `ap-south-1` |
| Default output format | `json` |

**`ap-south-1` is Mumbai.** Any region works, but pick one and be consistent —
resources in different regions cannot see each other, and this is the single
most common way a first AWS deploy goes wrong. If you are not in India, use the
region nearest you and use that same value everywhere below.

Now prove it works:

```bash
aws sts get-caller-identity
```

You want a JSON blob containing your account number and the `drishya-deploy`
user's ARN. If you get `InvalidClientTokenId`, the keys are wrong — re-run
`aws configure`. If you get "could not connect", check your network.

**Do not continue until this command works.** Everything after it depends on it,
and the errors further down will not point back here.

---

## Step 6 — Deploy (~25 min)

```bash
git clone https://github.com/Nsi442/Drishya.git
cd Drishya
export REGION=ap-south-1
./aws/deploy.sh
```

That is the whole thing. The script checks your tools and credentials first, so
if something from the steps above is missing it says so in the first few seconds
rather than fifteen minutes in.

What you will watch it do:

| | | Roughly |
|---|---|---|
| 1 | Check prerequisites | seconds |
| 2 | Look up a CloudFront address list | seconds |
| 3 | Generate two secrets into `.aws-secrets.env` | seconds |
| 4 | **Build the whole stack** | 15–20 min |
| 5 | Enable PostGIS on the database | 2 min |
| 6 | Build and push the API image | 3–5 min |
| 7 | Build and upload the frontend | 1 min |
| 8 | Wait for the API to answer | 1–3 min |

Step 4 prints nothing for a long time. That is normal — CloudFormation is
creating a database, and databases take fifteen minutes. Do not interrupt it. If
you want to watch, open **CloudFormation** in the console and look at the
`drishya` stack's *Events* tab.

At the end it prints a URL ending in `.cloudfront.net`. Open it and sign in as
`priya@anandauto.example` / `drishya`.

### If it stops with an error

The script fails loudly and every phase is safe to re-run. Fix what it names and
run `./aws/deploy.sh` again — it picks up where it left off rather than starting
over. The troubleshooting table in
[`AWS-DEPLOYMENT.md`](AWS-DEPLOYMENT.md#when-it-does-not-work) covers the
failures worth knowing.

---

## Step 7 — Three weeks later, delete it (~5 min)

**Put this in your calendar the same day you deploy.** This is the only step
with a real cost attached to skipping it.

```bash
cd Drishya
./scripts/teardown.sh aws
```

It asks you to type the stack name to confirm, then removes everything and waits
until it is really gone. It prints two commands to verify nothing survived — run
them.

Then, optionally:

- **IAM → Users → `drishya-deploy` → Delete.** The access key stops working
  everywhere the moment you do, which is worth doing whether or not you keep the
  account.
- Keep the AWS account. Closing it forfeits any unused credits and your free
  tier, and it does not cancel charges already incurred — deleting the resources
  is what stops the meter, and you have just done that.

---

## Things that catch people out, in one place

**Region mismatch.** Resources in `ap-south-1` cannot see resources in
`us-east-1`. If something is mysteriously "not found", check you are looking at
the right region — the console has a region picker in the top right, and it does
not always match your CLI default.

**The console shows one region at a time.** An empty EC2 list usually means
wrong region, not a failed deploy.

**Root user versus IAM user.** If you deploy signed in as one and inspect in the
console as the other, everything is still there — they are the same account. It
only feels confusing.

**A stopped instance is not a free instance.** Detail in
[`AWS-DEPLOYMENT.md`](AWS-DEPLOYMENT.md#running-it-for-a-few-weeks) — the short
version is that stopping things here saves almost nothing and breaks the site.

**`.aws-secrets.env` is not in git and must stay that way.** The deploy script
writes your database password and JWT signing key there. It is gitignored. Do
not move it, do not paste it into an issue, and do not commit it — check
`git status` before pushing anything after a deploy.

**Nothing here has been run against a real AWS account.** The template and the
script are lint-clean and internally consistent, but the first person to run
them will be the first person to run them. Budget an extra hour for that, and
read the error rather than assuming you did something wrong — it may well be
this repository.
