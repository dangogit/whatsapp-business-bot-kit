# Operations

Use these steps for Railway deployment, moving an existing bot to the cloud, or ending a demo.
Commands are examples: resolve the exact workspace, project, service, environment and channel first.
Read the installed CLI's `--help` when its version differs. Keep secret-bearing output private.

## Before deployment

- Confirm which real WhatsApp number and HookMyApp channel the owner intends to use. A sandbox
  session has an `ssn_` ID; a real channel has a `ch_` ID. They are different configurations.
- Confirm the owner approves the current `business.md`, especially when it describes a fictional
  demo. Connecting Meta does not itself connect the bot or prove automatic replies work.
- Use the private env file for that exact real channel, exported with `channels env --write`.
  Do not deploy the sandbox's root `.env` just because it is the default filename.
- Keep the existing bot and route available until the replacement is healthy. Record the old
  process IDs, their working directories and the current routing mode for rollback.
- Run `npm test`. Upload from the repository folder so unrelated work folders and private runtime
  files are not included. Keep private files outside that upload root, or use ignored root names
  such as `.env`, `.env.sandbox` and `.env.business`. Verify each in-repository secret file with
  `git check-ignore <exact-path>` before upload. An arbitrary filename such as `real.env` is not
  covered by the existing ignore rules. Never use `--no-gitignore`.

## Railway sign-in and project creation

Check `railway --version` first. If missing, install `@railway/cli` normally; its installation
downloads a binary, so `--ignore-scripts` does not work for this CLI.

Run `railway login`, let the owner complete the browser flow, then verify with `railway whoami`.
Being signed into `railway.com` is not enough if the CLI still says Unauthorized. Let the owner
complete the CLI consent screen; if needed, cancel only your pending login and start it again.
Do not extract browser credentials or create an account token as a workaround.

If Railway says the trial has expired, stop provisioning until the owner selects a plan. Do not
keep retrying or add payment details yourself. Hobby has a $5 monthly minimum, including $5 of
resource usage; usage above that costs extra. Check [current pricing](https://railway.com/pricing).

To configure the service before its first build:

```bash
railway init --name whatsapp-bot --workspace <workspace-id> --json
railway add --service whatsapp-bot --json
railway status --json
```

Capture the results and retain the exact project, service and production-environment IDs. Create
only one project: after a timeout, inspect the account before retrying creation. Set one replica,
app sleeping off, and a health check at `/health`. Use supported settings/API paths; inspect the
live schema before using GraphQL. Replies continue after the webhook is acknowledged, so sleeping
can interrupt processing. Conversation history and deduplication are not shared between replicas.

## Transfer variables privately

Read the selected real-channel env file into memory and pass each value on stdin, not in argv:

```bash
railway variable set ANTHROPIC_API_KEY --stdin --skip-deploys --project <project-id> --service <service-id> --environment <environment-id>
```

Use the same method for every other configured key, including `META_GRAPH_API_URL`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WEBHOOK_HMAC_SECRET`, `VERIFY_TOKEN`,
`HOOKMYAPP_CHANNEL_ID`, `WHATSAPP_WABA_ID`, and optional bot settings.

- Omit `PORT`: Railway supplies it.
- Omit the sandbox's `WHATSAPP_API_URL`.
- Set `BUSINESS_FILE=business.md` for the Docker image's `/app` directory. A local absolute path
  will not exist in the container. For a deliberately customized file, package it and use its
  container path instead.
- Preserve the existing Anthropic key. A Claude Code login is not an Anthropic API key.
- Never print the file, tokens, verify-token response, raw `channels env`, or raw Railway variable
  JSON/KV output. Capture CLI output privately and compare values in memory, reporting key names
  and mismatch counts only. Channel-list JSON may also contain signed media URLs.
- Confirm the real channel ID, phone-number ID, gateway URL and HMAC secret belong together. If
  both sandbox and real configs exist, check which source file is being read before every export.

Use `--skip-deploys` for all the updates, then upload the tested source once:

```bash
railway up --detach --project <project-id> --service <service-id> --environment <environment-id>
```

`--detach` means the upload started, not that the service is healthy. Await a successful deployment
and inspect its runtime logs, without exposing secrets. Verify one replica and app sleeping off.

## Public address and readiness

Read the actual listening port from the deployed process's startup log before creating a domain.
The Dockerfile's `EXPOSE 3000` does not override Railway's `PORT`.

```bash
railway domain --port <actual-port> --project <project-id> --service <service-id> --environment <environment-id>
```

If an existing domain routes to the wrong port, update it with the same service selectors:

```bash
railway domain update <domain> --port <actual-port> --project <project-id> --service <service-id> --environment <environment-id>
```

A running container with a mismatched domain port can return HTTP 502. Read back the domain's
target port and active state.

Before routing customers, prove all of these against the new public address:

1. `GET /health` returns HTTP 200 with `ok`.
2. `GET /webhook/whatsapp` matches the current `VERIFY_TOKEN`, compared privately.
3. An unsigned ordinary POST is rejected with HTTP 401.
4. The empty HookMyApp ownership probe succeeds: `X-HookMyApp-Probe: webhook-verification` and
   `User-Agent: HookMyApp-Webhook-Verifier`.
5. A correctly HMAC-signed payload with `entry: []` returns HTTP 200 without sending any messages.

These checks must not fabricate a customer webhook or send an unsolicited test message. The
expected unsigned-probe rejection may appear in logs; distinguish it from a failed real delivery.

## Cutover and proof

Explain and confirm the exact real number/channel and the healthy destination URL with the owner.
Moving the route ends the local CLI listener and starts a fresh in-memory history and pause state.
Keep `VERIFY_TOKEN` and `WEBHOOK_HMAC_SECRET` unchanged when only moving the URL. Privately read the
existing webhook configuration first: it must already have a non-empty verify token matching the
cloud's response. If absent or different, establish matching settings before moving the route.

```bash
hookmyapp channels webhook set <channel-id> --workspace <workspace-id> --url https://<domain>/webhook/whatsapp
```

With an existing configuration, omitting `--verify-token` preserves its current token, avoiding a
secret in the process arguments. Read back both the saved URL and unchanged token privately, then
check channel health. Have the owner send a real question from a
different WhatsApp account and confirm the answer arrived. A message sent from the connected
Business app is an owner echo, not a customer test.

Check delivery records for the new webhook destination and timestamp, plus the app's own outbound
failure logs. Older CLI failures do not prove the new cloud route failed. A direct public probe
blocked by an edge/WAF does not replace the provider-delivery check.

After the cloud reply is confirmed, stop only this project's old local server and any remaining
listener, verifying each exact PID and working directory first. Recheck cloud health and the saved
URL after cleanup to prove the cloud no longer depends on the laptop.

If cutover fails, explain rollback before changing the live route again. To restore the recorded
local mode, make its server ready, clear the new URL, then run the exact channel's CLI listener.
Do not delete data, rotate tokens, or alter another channel to recover a routing problem.

## End a demo or stop automatic replies

The owner's request to stop authorizes shutdown. Explain the effect, then disable forwarding and
remove the bot destination for the exact channel:

```bash
hookmyapp channels disable <channel-id> --workspace <workspace-id>
hookmyapp channels webhook clear <channel-id> --workspace <workspace-id>
railway down --yes --project <project-id> --service <service-id> --environment <environment-id>
```

Verify forwarding is false, the saved webhook URL is null, the cloud deployment is removed, and
its health endpoint no longer serves the bot. End only this demo's sandbox session if one exists
(`sandbox stop --session <session-id> --yes`), then stop only its recorded local processes. Do not
kill processes by name or port, and do not leave an extra local copy able to answer the demo.

Keep the owner's ordinary WhatsApp Business app working. Disabling forwarding does not remove
the number from Meta or cancel HookMyApp/Railway subscriptions. State that subscriptions remain;
do not cancel plans or delete the account unless separately requested. Do not restart the bot
to validate an unrelated kit update after the owner ended the demo.
