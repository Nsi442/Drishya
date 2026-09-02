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

## Step 3 — Make a user that is not root (~15 min)

This is the step people find most confusing, because IAM has its own vocabulary.
Two sentences of background make the rest obvious.

**Your root user is the email you signed up with.** It can do anything,
including closing the account and changing the card, and it cannot be
restricted. AWS's own advice is to lock it away after setup and never use it
again.

**An IAM user is a separate login inside the same account.** You decide what it
can do. You will make one, give it the permissions this deploy needs, and use it
for everything from here — both the console and the command line. Root goes back
in the drawer.

An **access key** is that user's username-and-password for the command line: an
*access key ID* (public-ish, starts `AKIA`) and a *secret access key* (private).
The `aws` CLI has no browser and no MFA prompt — the key pair is the whole
credential, which is why it matters where you put it.

---

### 3a. Create the user

Sign in as root, then go to **IAM** (type it in the console's top search bar) →
**Users** in the left sidebar → **Create user**.

**Screen 1 — user details**

- **User name:** `drishya-deploy`
- **Provide user access to the AWS Management Console** — **tick this.**

  You might expect a CLI-only identity here, and I originally suggested that.
  Ticking it is better: it gives you one identity for the console *and* the
  command line, which means you genuinely stop using root rather than using root
  "just for looking at things". One login to remember instead of two.

  Then choose **I want to create an IAM user**, set a **custom password** you
  will remember, and untick "Users must create a new password at next sign-in"
  — you are the user, so there is nobody to hand it to.

**Screen 2 — permissions**

Choose **Attach policies directly**, then search the list for
**`AdministratorAccess`** and tick it. Ignore the group options; groups are for
managing many people.

> **Why administrator, honestly.** Least privilege is the right principle and I
> am not following it here. This stack touches CloudFormation, EC2, RDS, S3,
> CloudFront, ECR, IAM and SSM, and writing the minimal policy across those
> eight — then debugging the deploy each time it turns out to be one action
> short — is a genuine afternoon. For a three-week project on a fresh account
> with nothing else in it, an administrator user you delete at teardown is the
> better trade. It is a trade, not a best practice.

**Screen 3 — review and create.** Create the user.

If you enabled console access, this screen shows a **sign-in URL** that looks
like `https://123456789012.signin.aws.amazon.com/console`. **Save that** — it is
how you sign in as this user rather than as root. The number is your account ID.

---

### 3b. Create the access key

Open the user you just made (**IAM → Users → `drishya-deploy`**) and go to the
**Security credentials** tab. Scroll to **Access keys** → **Create access key**.

**Screen 1 — use case.** A list of radio buttons. Choose **Command Line
Interface (CLI)**.

AWS then shows a yellow panel recommending alternatives — CloudShell, or
Identity Center. Both are reasonable in general and neither suits a one-off
deploy from your own laptop. Tick **"I understand the above recommendation and
want to proceed to create an access key"** and continue.

**Screen 2 — description tag.** Optional. `drishya deploy, delete after
<date>` is worth typing, because in six months this key will otherwise be an
unexplained credential with administrator rights.

**Screen 3 — retrieve keys.** You now see:

```
Access key       AKIA................
Secret access key ****************************************   [Show]
```

> **The secret is displayed exactly once.** Close this page without copying it
> and it is unrecoverable — not by you, not by AWS support. The fix is to delete
> the key and create another, which takes two minutes. Annoying, not fatal.

Click **Download .csv file**, or press **Show** and copy both values.

---

### 3c. Put the keys somewhere sensible

**Good:** your password manager, as a new entry with both values.

**Acceptable for three weeks:** the downloaded CSV, in your Documents folder,
deleted at teardown.

**Not acceptable:** anywhere inside a git repository, a Slack or WhatsApp
message, a screenshot, or a file called `keys.txt` on the Desktop. An
administrator access key on a public GitHub repository is found by scanners in
**minutes**, not days, and the usual outcome is a large bill for someone else's
crypto mining.

In the next step, `aws configure` writes these into `~/.aws/credentials` — a
plain text file in your home directory. That is normal and is how every AWS tool
expects to find them. It is also why the file is outside the project directory:
nothing you `git add` can ever pick it up.

---

### 3d. If something goes wrong later

| What you see | What it means |
|---|---|
| `InvalidClientTokenId` | The access key ID is wrong, or the key was deleted |
| `SignatureDoesNotMatch` | The secret is wrong — usually a truncated paste or a trailing space |
| `AccessDenied` on a specific action | The policy did not attach. Check the user's Permissions tab shows `AdministratorAccess` |
| `ExpiredToken` | You pasted temporary credentials from somewhere else. These keys do not expire |

**If you ever think a key has leaked:** IAM → Users → the user → Security
credentials → the key → **Deactivate**, then **Delete**. It stops working
everywhere immediately. Create a new one and re-run `aws configure`. Do this
first and worry about how it happened afterwards.

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
  account — an administrator key with no owner is the thing you do not want
  sitting around.

  Note this also removes your console login, so root becomes the only way back
  in. That is fine when you are finished. If you expect to come back, deactivate
  the *access key* only (Security credentials → the key → Deactivate) and leave
  the user itself alone.
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
