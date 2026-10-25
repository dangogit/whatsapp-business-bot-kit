// The web server HookMyApp delivers WhatsApp messages to.

import { createServer } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createBrain } from "./brain.js";
import { createBot } from "./bot.js";
import { createConversations } from "./conversations.js";
import { createSender, isVerificationProbe, parseWebhook, verifySignature } from "./whatsapp.js";

export function createApp({ config, bot, log = console }) {
  // One bad request must never take the bot down, so every error ends as a response.
  return createServer((req, res) => {
    handle(req, res).catch((err) => {
      log.error(`[server] ${err.message}`);
      if (!res.headersSent) send(res, 500, "error");
    });
  });

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return send(res, 400, "bad url");
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, "ok");
    }
    if (url.pathname !== config.webhookPath) {
      return send(res, 404, "not found");
    }

    if (req.method === "GET") {
      // Meta's own handshake (if you point Meta straight here) or HookMyApp's ownership check.
      if (url.searchParams.get("hub.mode") === "subscribe") {
        const ok = config.verifyToken && url.searchParams.get("hub.verify_token") === config.verifyToken;
        return ok ? send(res, 200, url.searchParams.get("hub.challenge") ?? "") : send(res, 403, "forbidden");
      }
      return send(res, 200, config.verifyToken);
    }
    if (req.method !== "POST") return send(res, 405, "method not allowed");

    let raw;
    try {
      raw = await readBody(req);
    } catch {
      return send(res, 413, "too large");
    }
    if (isVerificationProbe(req.headers, raw)) return send(res, 200, "ok");
    if (!verifySignature(raw, req.headers["x-hookmyapp-signature-256"], config.hmacSecret)) {
      log.warn("[server] rejected a webhook with a bad signature");
      return send(res, 401, "bad signature");
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return send(res, 400, "bad json");
    }

    // Answer HookMyApp right away and do the slow work (Claude, sending) afterwards.
    send(res, 200, "ok");
    Promise.resolve()
      .then(() => bot.handle(parseWebhook(payload)))
      .catch((err) => log.error(`[server] ${err.message}`));
  }
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const runDirectly = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (runDirectly()) {
  const config = loadConfig();
  const businessText = readFileSync(config.businessFile, "utf8");
  const bot = createBot({
    brain: createBrain({ businessText, model: config.model, effort: config.effort }),
    sender: createSender(config),
    conversations: createConversations({ historyTurns: config.historyTurns }),
    config,
  });
  createApp({ config, bot }).listen(config.port, () => {
    console.log(`WhatsApp bot listening on http://localhost:${config.port}${config.webhookPath}`);
    console.log(`Model ${config.model}, effort ${config.effort}, business info from ${config.businessFile}`);
  });
}
