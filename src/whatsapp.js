// Everything that talks WhatsApp: checking that a webhook really came from HookMyApp,
// reading Meta's webhook payload, and sending messages through the gateway.

import { createHmac, timingSafeEqual } from "node:crypto";

// HookMyApp signs every delivery with HMAC-SHA256 of the raw body. Hash the bytes exactly
// as they arrived: parsing and re-serializing the JSON changes them and the check fails.
export function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// `hookmyapp channels webhook set` sends one unsigned, empty POST to check the URL works.
export function isVerificationProbe(headers, rawBody) {
  return (
    headers["x-hookmyapp-probe"] === "webhook-verification" &&
    headers["user-agent"] === "HookMyApp-Webhook-Verifier" &&
    rawBody.length === 0
  );
}

// Turns a webhook into three lists: messages customers sent; "echoes", the replies you typed
// yourself in the WhatsApp Business app (only on a number connected with coexistence); and
// sends that WhatsApp accepted but later failed to deliver.
export function parseWebhook(payload) {
  const messages = [];
  const echoes = [];
  const failures = [];
  const list = (x) => (Array.isArray(x) ? x.filter((item) => item && typeof item === "object") : []);

  for (const entry of list(payload?.entry)) {
    for (const change of list(entry.changes)) {
      const value = change.value ?? {};

      if (change.field === "smb_message_echoes") {
        for (const echo of list(value.message_echoes)) {
          echoes.push({ id: echo.id, to: echo.to, text: echo.type === "text" ? echo.text?.body ?? "" : "" });
        }
        continue;
      }
      if (change.field !== "messages") continue;

      const names = Object.fromEntries(list(value.contacts).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of list(value.messages)) {
        if (!m.id || !m.from) continue;
        messages.push({ id: m.id, from: m.from, name: names[m.from] || "", type: m.type, text: textOf(m) });
      }
      for (const s of list(value.statuses)) {
        if (s.status !== "failed") continue;
        const error = list(s.errors)[0] ?? {};
        failures.push({ to: s.recipient_id, code: error.code, title: error.title ?? "" });
      }
    }
  }
  return { messages, echoes, failures };
}

function textOf(m) {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "button":
      return m.button?.text ?? "";
    default:
      // Images, voice notes, stickers... the bot sees that something arrived, not what.
      return `[The customer sent a ${m.type} message]`;
  }
}

export function createSender({ apiUrl, accessToken, phoneNumberId, fetchImpl = fetch }) {
  async function post(body, timeoutMs = 15_000) {
    const res = await fetchImpl(`${apiUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp send failed ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }

  return {
    // Free-form text only works within 24 hours of the customer's last message.
    sendText: (to, text) => post({ to, type: "text", text: { body: text } }),

    // Read/typing is optional. A slow gateway must not hold the reply for the full send timeout.
    showTyping: (messageId) =>
      post({ status: "read", message_id: messageId, typing_indicator: { type: "text" } }, 2_000),
  };
}
