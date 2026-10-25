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

## Going live in the cloud

The bot has to run somewhere always on. Help the owner pick a host they can manage (Railway, Render,
Fly.io, or a small VPS all work; there is a `Dockerfile`). What any host needs:

- One always-on instance. Not serverless: replies run after the webhook is acknowledged, and the
  conversation memory lives in the process.
- The environment variables from `.env`, set in the host's settings, never committed.
- A public HTTPS URL. Then point HookMyApp at it:
  `hookmyapp channels webhook set <ch_id> --url https://<host>/webhook/whatsapp --verify-token <VERIFY_TOKEN>`.
  Setting a URL stops any running `listen`.
- Check `https://<host>/health` returns `ok`, then send a real message.

If the business needs memory that survives restarts, or more than one instance, move
`src/conversations.js` to a database first.

## Working rules

- Run `npm test` after every code change. Add a test for any new logic.
- Secrets live only in `.env` (git-ignored) or the host's environment settings.
- Keep the code small and dependency-light. Ask before adding a framework or a database.
- `OWNER_PHONE` gets a WhatsApp when a customer needs a human, but only if that phone messaged the
  business number in the last 24 hours (a WhatsApp rule). Otherwise the failure shows in the log as
  `131047`. Tell the owner, and for a reliable alert suggest an approved utility template or email.
- Do not run `channels listen` on a live number casually: while it runs, real customers' messages go
  to this laptop.
