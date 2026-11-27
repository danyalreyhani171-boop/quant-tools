# Getting DR71Codes live

No terminal needed. Everything below happens in a web browser.

Budget about 25 minutes. You will create three free accounts, paste five values
into one form, and end with a real URL you can share.

**Costs:** hosting is free, the database is free, Stripe is free until you take
money (then ~1.5% + 20p per payment). The only thing you pay for up front is
OpenRouter credit — £5 goes a long way while you are testing.

---

## Before you start

Have these three tabs open. Sign up for each if you need to.

| Service | What it does | Link |
| --- | --- | --- |
| Neon | The database | <https://neon.tech> |
| OpenRouter | The AI that writes the code | <https://openrouter.ai> |
| Stripe | Takes the £17.99/month | <https://stripe.com> |
| Render | Hosts the site | <https://render.com> |

---

## Step 1 — Database (3 min)

1. Go to <https://console.neon.tech> and click **New Project**. Name it
   `dr71codes`. Pick the region closest to you.
2. On the project page, find **Connection string** and make sure the
   **Pooled connection** toggle is on.
3. Copy the whole string. It looks like:
   `postgresql://user:password@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require`
4. Paste it somewhere safe for a moment. This is your **DATABASE_URL**.

> You do not need to create any tables. The app builds them itself the first
> time it starts.

---

## Step 2 — OpenRouter key (3 min)

1. Go to <https://openrouter.ai/settings/keys> and click **Create Key**.
   Name it `dr71codes`.
2. Copy the key (starts with `sk-or-`). You only get to see it once.
   This is your **OPENROUTER_API_KEY**.
3. Go to <https://openrouter.ai/credits> and add some credit. £5 is plenty to
   test with — a single generation costs a few pence.

---

## Step 3 — Stripe price (5 min)

Stay in **Test mode** for now — the toggle is at the top right of the Stripe
dashboard. Nothing you do in test mode moves real money.

1. Go to <https://dashboard.stripe.com/test/products> → **Add product**.
   - Name: `DR71Codes Pro`
   - Price: `17.99`, currency **GBP**, **Recurring**, **Monthly**
   - Save.
2. On the product page, under Pricing, copy the **API ID**. It starts with
   `price_`. This is your **STRIPE_PRICE_ID**.
3. Go to <https://dashboard.stripe.com/test/apikeys> and reveal the
   **Secret key** (starts with `sk_test_`). This is your **STRIPE_SECRET_KEY**.
4. Go to <https://dashboard.stripe.com/test/settings/billing/portal> and click
   **Activate test link**. This is what lets customers cancel by themselves.

Leave the webhook for Step 5 — you need your site's address first.

---

## Step 4 — Deploy (5 min)

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect your GitHub account and pick the **quant-tools** repository.
3. Choose the branch with this code on it, then click **Apply**.
   Render reads `render.yaml` and knows what to build.
4. It will ask you for four values. Paste in what you collected:
   - `DATABASE_URL` — from Step 1
   - `OPENROUTER_API_KEY` — from Step 2
   - `STRIPE_SECRET_KEY` — from Step 3
   - `STRIPE_PRICE_ID` — from Step 3
   - `STRIPE_WEBHOOK_SECRET` — leave blank, you will add it next
5. Click **Apply** and wait. The first build takes about 3 minutes.

When it finishes, Render shows your URL at the top — something like
`https://dr71codes.onrender.com`. **Open it.** The site is live.

---

## Step 5 — Stripe webhook (4 min)

This is the step people skip, and then payments appear to work but nobody gets
access. Do not skip it.

1. Go to <https://dashboard.stripe.com/test/webhooks> → **Add endpoint**.
2. Endpoint URL: your Render address with `/api/stripe/webhook` on the end,
   e.g. `https://dr71codes.onrender.com/api/stripe/webhook`
3. Click **Select events** and tick these six:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Add the endpoint, then click **Reveal** under **Signing secret** and copy it
   (starts with `whsec_`).
5. Back in Render: your service → **Environment** → find `STRIPE_WEBHOOK_SECRET`
   → paste it → **Save changes**. Render redeploys automatically.

---

## Step 6 — Check it (2 min)

Open `https://your-site.onrender.com/setup`.

Every row should be green. If one is not, it tells you exactly what to fix.
Add the missing value in Render → Environment, save, wait for the redeploy, and
refresh.

> `/setup` is open only while no account exists yet. As soon as you sign up it
> needs a login, so strangers cannot see your configuration.

---

## Step 7 — Try it end to end (3 min)

1. Click **Get started** and create an account with your real email.
2. Subscribe. Use Stripe's test card:
   - Number `4242 4242 4242 4242`
   - Any future expiry, any 3-digit CVC, any postcode
3. You should land back on the generator.
4. Type a strategy and generate. Watch the six agents run. Copy the code and
   paste it into TradingView's Pine Editor to confirm it compiles.

If all of that works, the product works.

---

## Going live for real

Only after Step 7 passes:

1. In Stripe, flip the dashboard from **Test mode** to **Live mode**.
2. Recreate the product and £17.99/month price in live mode, and copy the new
   `price_` id.
3. Get your live secret key (`sk_live_...`) from the live API keys page.
4. Create the webhook again in live mode, pointing at the same URL, with the
   same six events. Copy the new `whsec_`.
5. In Render → Environment, replace `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and
   `STRIPE_WEBHOOK_SECRET` with the live versions. Save.
6. Upgrade the Render service from **Free** to **Starter** (~$7/month) so your
   site stops sleeping between visits. A paying customer should never wait 30
   seconds for a cold start.

You are now taking real money.

---

## If something goes wrong

**The site won't build.** Render → your service → **Logs**. The error is
usually the last red line.

**"Could not reach OpenRouter".** The key is wrong, or the account has no
credit. Check <https://openrouter.ai/credits>.

**Generation times out.** The six agents take 1–3 minutes. Render's free plan
has no request limit, so this normally means a model is slow — try setting
`OPENROUTER_MODEL` to something faster.

**Someone paid but has no access.** The webhook is wrong. Stripe → Webhooks →
your endpoint shows every delivery and its response. A `400` means the signing
secret does not match what is in Render.

**Database errors.** Make sure the Neon string is the **pooled** one and ends
with `?sslmode=require`.

**First visit is slow.** That is the free plan waking up. Upgrade to Starter.

---

## Deploying to Vercel instead

Vercel works and `vercel.json` is included, but note the catch: the generator
makes six sequential model calls and can run for two or three minutes. Vercel's
Hobby plan caps a function at 60 seconds, which will cut generations off
part-way. You need the **Pro** plan for this app. Render's free plan has no such
cap, which is why it is the recommendation above.
