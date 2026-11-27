# DR71Codes

Describe a trading strategy in plain English; get working **TradingView Pine Script v6** or
**MetaTrader 5 MQL5** code back, written and checked by a six-agent pipeline running on
OpenRouter. Subscription-gated with Stripe at £17.99/month.

Code generation only — there is no broker connection, no live execution and no backtesting
engine anywhere in this product. TradingView's Strategy Tester and MetaTrader's own tester
already do that job, on your data.

## The four outputs

| Output | Language | Places orders |
| --- | --- | --- |
| TradingView Indicator | Pine Script v6 `indicator()` | No |
| TradingView Algo Strategy | Pine Script v6 `strategy()` | Yes |
| MetaTrader 5 Indicator | MQL5 custom indicator | No |
| MetaTrader 5 Algo EA | MQL5 Expert Advisor | Yes |

Each one gets its own platform-specific prompt rules, its own syntax highlighting, and its own
"Where to Paste This" guide.

## The six agents

Run in sequence, each handed everything the previous ones produced:

1. **Strategy Architect** — turns the description into an unambiguous spec and records every
   ambiguity it resolved, so later agents do not re-litigate them.
2. **Risk Engineer** — designs the stop loss, take profit and position-sizing layer as real
   inputs with real defaults, in the target platform's idioms.
3. **Code Writer** — writes the complete single file against both specs.
4. **Debugger** — works a twenty-point checklist of the mistakes that actually stop Pine and
   MQL5 compiling (removed built-ins, conditional `ta.` calls, series/simple type errors,
   series-index mix-ups, MQL4 constructs).
5. **Verifier** — independently traces the code bar by bar: cold start, long entry, short
   entry, stop hit — and checks the arithmetic sign on each side separately.
6. **Finaliser** — polishes naming, groups the inputs, and writes the user-facing notes.

If one of the last three stages fails upstream, the run finishes with the best file it has and
a warning, rather than throwing away work the user waited minutes for.

After the pipeline, the output goes through a local `sanityCheck`: bracket balance (ignoring
strings and comments), required declarations, truncation markers, and pre-v5 Pine built-ins.

## Running it

Needs Node 20.9+ and a Postgres database.

```bash
npm install
cp .env.example .env.local      # then fill it in — see below
npm run db:init                 # applies db/schema.sql, idempotent
npm run dev
```

### Required environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Managed providers usually need `?sslmode=require`. |
| `AUTH_SECRET` | Signs the session cookie. 32+ characters: `openssl rand -base64 32`. |
| `OPENROUTER_API_KEY` | From <https://openrouter.ai/keys>. |
| `STRIPE_SECRET_KEY` | Use `sk_test_...` until you are ready to charge. |
| `STRIPE_PRICE_ID` | A recurring £17.99/month price you create in Stripe. |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen`, or the endpoint's signing secret. |
| `NEXT_PUBLIC_APP_URL` | Absolute URL of the deployment, for Stripe redirects. |

`.env.example` documents the optional ones: per-stage model overrides, the hourly fair-use cap,
and `OPENROUTER_BASE_URL` for routing through a gateway.

### Model selection

Simplest is one model for everything:

```
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

Or split by tier — a cheap model for the two spec-writing stages, a strong one for the four
code stages:

```
OPENROUTER_MODEL_PLANNING=anthropic/claude-haiku-4.5
OPENROUTER_MODEL_CODING=anthropic/claude-sonnet-4.5
```

Any single stage can be overridden with `OPENROUTER_MODEL_ARCHITECT`, `_RISK`, `_CODER`,
`_DEBUGGER`, `_VERIFIER`, `_FINALIZER`, which win over the tier settings.

### Stripe setup

1. Create a **recurring** product priced at £17.99/month; put its `price_...` id in
   `STRIPE_PRICE_ID`.
2. Enable the **Customer Portal** in Stripe settings — `/account` uses it for card changes and
   cancellation.
3. Point a webhook at `POST /api/stripe/webhook` subscribed to `checkout.session.completed`,
   `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`. Locally:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

The webhook is the only writer of subscription state, so the database can never disagree with
Stripe for longer than it takes an event to arrive. Events are recorded by id, so a redelivery
is a no-op.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # 59 unit tests, no network or database needed
npm run build
```

The tests cover the parts where a silent bug would be expensive: pulling code back out of
free-form model output, the Pine/MQL5 tokeniser (including a lossless round-trip invariant),
password hashing, and the subscription access rule.

## Layout

```
src/app/              pages and route handlers
  api/generate/       the SSE endpoint that streams the pipeline
  api/stripe/         checkout, customer portal, webhook
src/components/       UI, incl. CodeBlock (copy/download) and AgentTimeline
src/lib/
  agents/             openrouter client, prompts, pipeline, output parsing
  targets.ts          the four outputs and their paste guides
  subscription.ts     the single definition of "may generate code"
  highlight.ts        Pine Script / MQL5 tokeniser
db/schema.sql         users, generations, stripe_events
public/tools.html     the original static calculators, served at /tools.html
```

### Notes on a couple of choices

**Auth** is a signed JWT in an HttpOnly cookie plus scrypt password hashing from Node's
standard library — no native modules to compile, nothing extra to keep patched. Only the user
id and email live in the token; subscription status is always read from the database, so
revoking access takes effect on the next request.

**Syntax highlighting** is a ~250-line tokeniser rather than a library. Neither highlight.js
nor Shiki has a Pine Script grammar, and shipping 300 KB to approximate two languages was a bad
trade.

## Deploying

Works on any Node host. On Vercel, note that `/api/generate` makes six sequential model calls
and sets `maxDuration = 800`, which needs a plan that permits long function durations.

---

**Risk warning.** This project generates code. It gives no financial advice, executes no
trades, and makes no claim that any generated strategy is profitable. Generated code is a
starting point you must read, test and take responsibility for. Run it in the TradingView
Strategy Tester or on a MetaTrader demo account before risking real money. Trading carries
risk of loss.
