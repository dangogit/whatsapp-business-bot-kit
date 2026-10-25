import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSender, isVerificationProbe, parseWebhook, verifySignature } from "../src/whatsapp.js";

const sign = (body, secret) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("accepts a correct signature and rejects a wrong or missing one", () => {
  const body = Buffer.from('{"a":1}');
  assert.equal(verifySignature(body, sign(body, "s3cret"), "s3cret"), true);
  assert.equal(verifySignature(body, sign(body, "other"), "s3cret"), false);
  assert.equal(verifySignature(body, undefined, "s3cret"), false);
  assert.equal(verifySignature(body, "sha256=short", "s3cret"), false);
});

test("a re-serialized body no longer matches the signature", () => {
  const original = Buffer.from('{ "a": 1 }');
  const reserialized = Buffer.from(JSON.stringify(JSON.parse(original)));
  assert.equal(verifySignature(reserialized, sign(original, "k"), "k"), false);
});

test("recognises only the exact HookMyApp verification probe", () => {
  const headers = { "x-hookmyapp-probe": "webhook-verification", "user-agent": "HookMyApp-Webhook-Verifier" };
  assert.equal(isVerificationProbe(headers, Buffer.alloc(0)), true);
  assert.equal(isVerificationProbe(headers, Buffer.from("{}")), false);
  assert.equal(isVerificationProbe({ "x-hookmyapp-probe": "webhook-verification" }, Buffer.alloc(0)), false);
});

test("parses text, button replies, media and owner echoes", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [
        {
          field: "messages",
          value: {
            contacts: [{ wa_id: "972500000001", profile: { name: "Dana" } }],
            messages: [
              { id: "m1", from: "972500000001", type: "text", text: { body: "מה השעות?" } },
              { id: "m2", from: "972500000001", type: "interactive", interactive: { button_reply: { title: "כן" } } },
              { id: "m3", from: "972500000001", type: "image", image: { id: "x" } },
            ],
            statuses: [{ id: "s1", status: "delivered" }],
          },
        },
        { field: "smb_message_echoes", value: { message_echoes: [{ id: "e1", to: "972500000002", type: "text", text: { body: "בדרך" } }] } },
      ],
    }],
  };
  const { messages, echoes } = parseWebhook(payload);
  assert.deepEqual(messages.map((m) => m.text), ["מה השעות?", "כן", "[The customer sent a image message]"]);
  assert.equal(messages[0].name, "Dana");
  assert.deepEqual(echoes, [{ id: "e1", to: "972500000002", text: "בדרך" }]);
});

test("reports sends that WhatsApp failed to deliver", () => {
  const { failures } = parseWebhook({ entry: [{ changes: [{ field: "messages", value: { statuses: [
    { status: "delivered", recipient_id: "1" },
    { status: "failed", recipient_id: "972599999999", errors: [{ code: 131047, title: "Re-engagement message" }] },
  ] } }] }] });
  assert.deepEqual(failures, [{ to: "972599999999", code: 131047, title: "Re-engagement message" }]);
});

test("survives a payload with unexpected shapes", () => {
  const { messages } = parseWebhook({ entry: [null, { changes: "x" }, { changes: [null, { field: "messages", value: { messages: [null, {}] } }] }] });
  assert.equal(messages.length, 0);
});

test("ignores payloads that carry only delivery statuses", () => {
  const { messages, echoes } = parseWebhook({ entry: [{ changes: [{ field: "messages", value: { statuses: [{}] } }] }] });
  assert.equal(messages.length + echoes.length, 0);
});

test("sends text through the gateway with the bearer token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
  };
  const sender = createSender({ apiUrl: "https://gw/meta/v22.0", accessToken: "hmat_x", phoneNumberId: "123", fetchImpl });
  await sender.sendText("972500000001", "שלום");
  assert.equal(calls[0].url, "https://gw/meta/v22.0/123/messages");
  assert.equal(calls[0].init.headers.Authorization, "Bearer hmat_x");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    messaging_product: "whatsapp", to: "972500000001", type: "text", text: { body: "שלום" },
  });
});

test("a failed send throws with the gateway's answer", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { code: 131047 } }), { status: 400 });
  const sender = createSender({ apiUrl: "https://gw", accessToken: "t", phoneNumberId: "1", fetchImpl });
  await assert.rejects(sender.sendText("1", "hi"), /400.*131047/);
});

test("normalizes an Israeli local number to the WhatsApp format", async () => {
  const { normalizePhone } = await import("../src/config.js");
  assert.equal(normalizePhone("050-123-4567"), "972501234567");
  assert.equal(normalizePhone("+972 50 123 4567"), "972501234567");
  assert.equal(normalizePhone(""), "");
});
