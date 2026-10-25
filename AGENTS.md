# WhatsApp Business Bot Kit: instructions for the coding agent

This repository is a WhatsApp bot that answers a small business's customers in the business's name.
The person working with you is usually the business owner, not a developer. Explain in plain words,
in their language, and do the terminal work yourself whenever you can.

## How it works

```
Customer on WhatsApp -> Meta Cloud API -> HookMyApp (signs, forwards) -> src/server.js
  -> src/bot.js -> src/brain.js (Claude + business.md) -> reply through the HookMyApp gateway
```

| File | Job |
|---|---|
| `business.md` | Everything the bot knows about the business. The bot answers only from this file. |
| `src/brain.js` | The Claude call: rules, the `handoff_to_human` tool, model and effort. |
| `src/bot.js` | Per-message flow: dedupe, pause, typing, reply, handoff, owner notification. |
| `src/whatsapp.js` | Signature check, webhook parsing, sending through the gateway. |
| `src/conversations.js` | In-memory history per customer, pauses, ordering. Lost on restart. |
| `src/server.js` | HTTP server: `GET /health`, `GET` and `POST` on `WEBHOOK_PATH`. |
| `src/config.js` | All settings, from `.env` or the host's environment variables. |

## Getting it running (do these for the owner)

1. Node.js 20.12 or newer: `node --version`.
2. `npm install`
3. HookMyApp CLI: `npm install -g @gethookmyapp/cli@latest`, then `hookmyapp login`. The login opens
   a browser; the owner completes it. The npm package is `@gethookmyapp/cli`, not `hookmyapp`.
4. WhatsApp credentials:
   - Testing: `hookmyapp sandbox start whatsapp`. The owner sends the printed code from their phone
     to the sandbox number. Then `hookmyapp sandbox env --write .env`.
   - Their own number: `hookmyapp channels connect whatsapp` (Meta Embedded Signup, in the browser),
     `hookmyapp channels list`, then `hookmyapp channels env <ch_id> --write .env`.
5. Add `ANTHROPIC_API_KEY` to `.env`. The owner creates it at https://platform.claude.com (API keys).
   Never print it, never commit it, never paste it into chat output.
6. `npm start`, and in a second terminal:
   - Sandbox: `hookmyapp sandbox listen --port 3000 --path /webhook/whatsapp`
   - Own number, local: `hookmyapp channels listen <ch_id> --port 3000 --path /webhook/whatsapp`

   Always pass `--path /webhook/whatsapp`. Without it the tunnel delivers to `/webhook` and every
   message gets a 404.
7. The owner sends a WhatsApp message and gets an answer. `hookmyapp channels health <ch_id>` helps
   when nothing arrives.

A variable already set in the shell wins over the same name in `.env`. If the bot uses the wrong
Anthropic key, check `echo ${ANTHROPIC_API_KEY:+set}` in the shell that runs `npm start`.

`hookmyapp sandbox env --write .env` replaces the whole file and asks first (pass `--force` in a
non-interactive shell), so run it before adding `ANTHROPIC_API_KEY` and the optional settings.
`hookmyapp channels env <ch_id> --write .env` updates its own keys and keeps the rest. When moving
from the sandbox to a real number, check afterwards that `WEBHOOK_HMAC_SECRET` and the API URL changed;
a leftover sandbox secret makes every real webhook fail with 401.

## Making it about their business

This is the main job. Interview the owner, one short question at a time, and fill `business.md`:
what they sell, prices, hours, location, booking, cancellation, the questions customers ask most,
the tone they want, and which topics must always go to a human. Copy their exact numbers and
policies. Do not invent anything to fill a gap: leave it out, and the bot will hand that question off.

Then test it with them: send real questions from their phone, read the answers together, and adjust
`business.md` until the answers sound like the business. Change `src/brain.js` only for behaviour
that `business.md` cannot express.

## Rules that come from Meta (do not remove them)

- **The bot must stay about this business.** Meta's terms (Section 4.7) ban offering a general-purpose
  AI assistant on WhatsApp. A business-specific customer-service bot is fine. Keep the "only help
  with this business" rule in `src/brain.js`.
- **There must be a way to reach a human.** Meta's Business Messaging Policy requires a clear
  escalation path. That is `handoff_to_human`; keep it.
- **24-hour window.** Free-form replies only work within 24 hours of the customer's last message.
  Anything later (reminders, follow-ups, campaigns) needs an approved template.
- **Cost.** Since 1 October 2026 each number gets 1,000 free service replies a month, then Meta
  charges per reply. Without a payment method on the WhatsApp Business Account, replies stop after
  the free 1,000. HookMyApp counts sends as actions on its own plan. Claude usage is billed to the
  Anthropic account. Tell the owner about all three before going live.
- **Connecting a number.** A number registered on the regular WhatsApp app must have that WhatsApp
  account deleted first, and its history is lost. A number on the WhatsApp Business app can connect
  with coexistence and keep the app. When unsure, start with the sandbox. Confirm with the owner
  before any step that affects their real number.

## Going live in the cloud (Railway)

The bot runs on Railway: one always-on service built from this folder's `Dockerfile`. Railway's Hobby
plan is $5 a month including $5 of usage, which covers a bot this size; the Free plan ($1 credit a
month) is not enough for an always-on service. Go live after the owner's real number is connected
(`channels env` written): the sandbox only delivers through `sandbox listen` on this machine.

1. Install the CLI. macOS: `brew install railway`. Elsewhere: `npm install -g @railway/cli` (it
   downloads its binary in an install script, so it fails under `--ignore-scripts`; the fallback is
   `curl -fsSL https://railway.com/install.sh | sh`). Check with `railway --version`.
2. `railway login`. A browser opens; the owner signs in or creates the account. They add a card and
   pick Hobby in the Railway dashboard.
3. Create the project and service and upload the code, from this folder:
   `railway up -y --detach --name whatsapp-bot`
   It uploads the folder (`.gitignore` is respected, so `.env` stays local), creates the project and
   service, and starts a build. The first deploy fails until the variables exist; that is expected.
4. Copy every key from `.env` except `PORT` (Railway sets its own) into the service. Read each value
   from `.env` and pipe it, so no secret appears on a command line or in your output:
   `printf %s "$VALUE" | railway variable set ANTHROPIC_API_KEY --stdin --skip-deploys`
   Do this for `META_GRAPH_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WEBHOOK_HMAC_SECRET`, `VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, and any optional ones set
   (`OWNER_PHONE`, `BOT_EFFORT`...). Set the last one without `--skip-deploys` so it redeploys.
5. `railway domain` prints the public address, `https://<name>.up.railway.app`.
6. `curl https://<name>.up.railway.app/health` must print `ok`. If not, `railway logs` shows why
   (a missing variable names itself: "Missing settings: ...").
7. Point HookMyApp at it. This stops any running `listen`:
   `hookmyapp channels webhook set <ch_id> --url https://<name>.up.railway.app/webhook/whatsapp --verify-token <VERIFY_TOKEN>`
8. The owner sends a real message from their phone and gets an answer.

Later changes: edit `business.md` or the code, run `npm test`, then `railway up --detach` again.
Changing a variable: `railway variable set KEY --stdin` (redeploys by itself).

Run one instance only, and leave Railway's Serverless (app sleeping) setting off: replies run after
the webhook is acknowledged, and the conversation memory lives in the process. Memory resets on every
deploy. If the business needs memory that survives restarts, move `src/conversations.js` to a
database first (`railway add --database postgres`).

## Working rules

- Run `npm test` after every code change. Add a test for any new logic.
- Secrets live only in `.env` (git-ignored) or Railway's service variables.
- Keep the code small and dependency-light. Ask before adding a framework or a database.
- `OWNER_PHONE` gets a WhatsApp when a customer needs a human, but only if that phone messaged the
  business number in the last 24 hours (a WhatsApp rule). Otherwise the failure shows in the log as
  `131047`. With coexistence the owner's own phone is the business number, so `OWNER_PHONE` must be a
  different phone. Tell the owner, and for a reliable alert suggest an approved utility template or email.
- Do not run `channels listen` on a live number casually: while it runs, real customers' messages go
  to this laptop.
