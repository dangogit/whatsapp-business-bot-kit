// Reads every setting from the environment. `hookmyapp sandbox env --write .env` or
// `hookmyapp channels env <channel> --write` fills the WhatsApp half; you add the rest.

try {
  process.loadEnvFile();
} catch {
  // No .env file: on a cloud host the variables come from its settings page.
}

const env = process.env;

function positive(name, fallback) {
  if (!env[name]) return fallback;
  const value = Number(env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got "${env[name]}"`);
  return value;
}

// WhatsApp sends numbers as digits with the country code (972501234567). Israeli owners often
// type 050-1234567, so a leading 0 becomes 972.
export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

export function loadConfig() {
  const config = {
    port: Number(env.PORT || 3000),
    webhookPath: env.WEBHOOK_PATH || "/webhook/whatsapp",

    // HookMyApp writes WHATSAPP_API_URL for the sandbox and META_GRAPH_API_URL for a real number.
    apiUrl: env.META_GRAPH_API_URL || env.WHATSAPP_API_URL,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    hmacSecret: env.WEBHOOK_HMAC_SECRET,
    verifyToken: env.VERIFY_TOKEN || "",

    model: env.BOT_MODEL || "claude-opus-5-5",
    effort: env.BOT_EFFORT || "low",
    businessFile: env.BUSINESS_FILE || "business.md",

    ownerPhone: normalizePhone(env.OWNER_PHONE),
    handoffPauseHours: positive("HANDOFF_PAUSE_HOURS", 12),
    historyTurns: positive("HISTORY_TURNS", 20),
    maxRepliesPerHour: positive("MAX_REPLIES_PER_HOUR", 30),
    typingIndicator: env.TYPING_INDICATOR !== "false",
  };

  const missing = [
    ["META_GRAPH_API_URL or WHATSAPP_API_URL", config.apiUrl],
    ["WHATSAPP_ACCESS_TOKEN", config.accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", config.phoneNumberId],
    ["WEBHOOK_HMAC_SECRET", config.hmacSecret],
    ["ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing settings: ${missing.join(", ")}. See .env.example.`);
  }
  return config;
}
