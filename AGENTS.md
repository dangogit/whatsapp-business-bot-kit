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

1. Node.js 20.12 or newer: `node --version`. On Windows, install it with `winget install OpenJS.NodeJS.LTS`.
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

Check installed CLIs before installing them again. A browser signed into a website is not proof
that its CLI is authenticated: verify with `hookmyapp doctor` or `railway whoami` as appropriate.
The owner completes sign-in, permissions, phone binding and payment steps themselves.

`sandbox start whatsapp --json` returns a code and link; it does not bind the phone. The owner must
press Send in WhatsApp, then `sandbox status` must show the active session. Reuse the current code
while valid instead of repeatedly creating login or binding flows.

A variable already set in the shell wins over the same name in `.env`. If the bot uses the wrong
Anthropic key, check `echo ${ANTHROPIC_API_KEY:+set}` in the shell that runs `npm start`.

`hookmyapp sandbox env --write .env` replaces the whole file and asks first (pass `--force` in a
non-interactive shell), so run it before adding `ANTHROPIC_API_KEY` and the optional settings.
`hookmyapp channels env <ch_id> --write .env` updates its own keys and keeps the rest. When moving
from the sandbox to a real number, check afterwards that `WEBHOOK_HMAC_SECRET` and the API URL changed;
a leftover sandbox secret makes every real webhook fail with 401.
If keeping both modes, use ignored root files such as `.env.sandbox` and `.env.business`, or keep
private files outside the upload root. Verify the exact path is ignored before upload. Identify the
intended phone/channel before exporting or deploying. Never copy sandbox settings to a live bot.

Never print `.env`, raw `channels env`, or Railway variable-list output. Even channel-list JSON can
contain signed media URLs: capture it privately and show only the needed identity/state fields.

## Windows

Everything in `src/` and `test/` is plain Node with no shell scripts, and CI runs the tests and a
server start on Windows, macOS and Linux. Commands in this file are written for Bash; on Windows use
Git Bash or translate them to PowerShell. Never write `.env` with PowerShell's `>` or `>>`: Windows
PowerShell 5 writes UTF-16, which breaks the file. Edit `.env` with your file tools instead.
HookMyApp's local tunnel supports Windows x64; Windows on ARM is unverified by HookMyApp.

## Making it about their business

This is the main job. Interview the owner, one short question at a time, and fill `business.md`:
what they sell, prices, hours, location, booking, cancellation, the questions customers ask most,
the tone they want, and which topics must always go to a human. Copy their exact numbers and
policies. Do not invent anything to fill a gap: leave it out, and the bot will hand that question off.

Then test it with them: send real questions from their phone, read the answers together, and adjust
`business.md` until the answers sound like the business. Change `src/brain.js` only for behaviour
that `business.md` cannot express.

For an explicitly requested fictional demo, label invented business data as fictional and collect
invented details only. Get the owner's approval before routing a real number to that demo. Explain
handoff: without `OWNER_PHONE` there is a pause and log entry, not a notification to a real person.
A short `HANDOFF_PAUSE_HOURS` can suit repeated demo tests; keep it a local setting.

## Rules that come from Meta (do not remove them)

- **The bot must stay about this business.** Meta's terms (Section 4.7) ban offering a general-purpose
  AI assistant on WhatsApp. A business-specific customer-service bot is fine. Keep the "only help
  with this business" rule in `src/brain.js`.
- **There must be a way to reach a human.** Meta's Business Messaging Policy requires a clear
  escalation path. That is `handoff_to_human`; keep it.
- **24-hour window.** Free-form replies only work within 24 hours of the customer's last message.
  A website signup does not open that window. Business-initiated reminders and follow-ups outside
  it need an approved template and opt-in. This kit does not implement outbound signup automation.
- **Cost.** Since 1 October 2026 each number gets 1,000 free service replies a month, then Meta
  charges per reply. Without a payment method on the WhatsApp Business Account, replies stop after
  the free 1,000. HookMyApp counts sends as actions on its own plan. Claude usage is billed to the
  Anthropic account. Tell the owner about all three before going live.
- **Connecting a number.** A number registered on the regular WhatsApp app must have that WhatsApp
  account deleted first, and its history is lost. A number on the WhatsApp Business app can connect
  with coexistence and keep the app. When unsure, start with the sandbox. Confirm with the owner
  before any step that affects their real number.

## Deployment, migration and shutdown

Read [docs/operations.md](docs/operations.md) before a Railway deployment, a change to a real
number's destination, or shutdown. It covers CLI authentication, paid-plan blockers, private variable
transfer, Railway's actual listening port, webhook probes, cutover, rollback and complete shutdown.

Keep the current route working until its replacement passes the checks. Explain and confirm the
exact number and destination URL before changing live routing. A successful build or health check
alone is not an end-to-end WhatsApp test: the owner sends from a different WhatsApp account and
confirms receipt. After cutover, stop only this project's old local processes by verified PID/cwd.

Use one always-on instance, with app sleeping off. History, deduplication and handoff pauses reset
on restart. Do not add a database without the owner's direction. A request to stop a demo is not
permission to restart it for validation, cancel subscriptions or delete the owner's WhatsApp account.

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
