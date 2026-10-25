import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApp } from "../src/server.js";

const config = { webhookPath: "/webhook/whatsapp", hmacSecret: "secret", verifyToken: "vt" };
const handled = [];
const bot = { handle: async (batch) => handled.push(batch) };
const quiet = { info() {}, warn() {}, error() {} };
let base;
let server;

before(async () => {
  server = createApp({ config, bot, log: quiet });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const signed = (body) => ({
  "Content-Type": "application/json",
  "X-HookMyApp-Signature-256": "sha256=" + createHmac("sha256", "secret").update(body).digest("hex"),
});

test("GET answers the HookMyApp ownership check and Meta's handshake", async () => {
  assert.equal(await (await fetch(`${base}/webhook/whatsapp`)).text(), "vt");
  const meta = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`);
  assert.equal(await meta.text(), "42");
  const wrong = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42`);
  assert.equal(wrong.status, 403);
});

test("rejects an unsigned delivery", async () => {
  const res = await fetch(`${base}/webhook/whatsapp`, { method: "POST", body: "{}" });
  assert.equal(res.status, 401);
});

test("accepts the unsigned verification probe", async () => {
  const res = await fetch(`${base}/webhook/whatsapp`, {
    method: "POST",
    headers: { "X-HookMyApp-Probe": "webhook-verification", "User-Agent": "HookMyApp-Webhook-Verifier" },
  });
  assert.equal(res.status, 200);
});

test("a signed delivery is acknowledged and handed to the bot", async () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "m1", from: "1", type: "text", text: { body: "hi" } }] } }] }],
  });
  const res = await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: signed(body), body });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(handled.at(-1).messages[0].text, "hi");
});

test("a malformed request path does not crash the server", async () => {
  const net = await import("node:net");
  const reply = await new Promise((resolve) => {
    const socket = net.connect(server.address().port, "127.0.0.1", () => socket.write("GET // HTTP/1.1\r\nHost: x\r\n\r\n"));
    socket.once("data", (d) => { resolve(String(d)); socket.destroy(); });
  });
  assert.match(reply, /^HTTP\/1.1 400/);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test("health check and unknown paths", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});
