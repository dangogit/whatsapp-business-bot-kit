import { test } from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../src/bot.js";
import { createBrain, FALLBACK_REPLY } from "../src/brain.js";
import { createConversations } from "../src/conversations.js";

const quiet = { info() {}, warn() {}, error() {} };
const config = { ownerPhone: "972599999999", handoffPauseHours: 12, typingIndicator: true, maxRepliesPerHour: 30 };

function setup(reply, { failCustomerSend = false, cfg = config } = {}) {
  const sent = [];
  const typing = [];
  const sender = {
    sendText: async (to, text) => {
      if (failCustomerSend && to !== cfg.ownerPhone) throw new Error("gateway 503");
      sent.push({ to, text });
    },
    showTyping: async (id) => typing.push(id),
  };
  const brain = { reply };
  const conversations = createConversations();
  const bot = createBot({ brain, sender, conversations, config: cfg, log: quiet });
  return { bot, sent, typing, conversations };
}

const msg = (id, text, from = "972500000001") => ({ id, from, name: "Dana", type: "text", text });

test("answers a customer and remembers the conversation", async () => {
  const { bot, sent, typing, conversations } = setup(async () => ({ text: "פתוחים 9 עד 18", handoff: null }));
  await bot.handle({ messages: [msg("m1", "מה השעות?")], echoes: [] });
  assert.deepEqual(sent, [{ to: "972500000001", text: "פתוחים 9 עד 18" }]);
  assert.deepEqual(typing, ["m1"]);
  assert.deepEqual(conversations.history("972500000001").map((t) => t.role), ["user", "assistant"]);
});

test("a duplicate delivery is answered only once", async () => {
  const { bot, sent } = setup(async () => ({ text: "hi", handoff: null }));
  await bot.handle({ messages: [msg("m1", "hi")], echoes: [] });
  await bot.handle({ messages: [msg("m1", "hi")], echoes: [] });
  assert.equal(sent.length, 1);
});

test("a handoff notifies the owner and pauses the bot for that customer", async () => {
  const { bot, sent } = setup(async () => ({
    text: "מישהו מהצוות יחזור אלייך",
    handoff: { reason: "Asked for a refund", summary: "Wants money back for order 12" },
  }));
  await bot.handle({ messages: [msg("m1", "אני רוצה החזר")], echoes: [] });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].to, "972599999999");
  assert.match(sent[1].text, /Asked for a refund/);

  await bot.handle({ messages: [msg("m2", "הלו?")], echoes: [] });
  assert.equal(sent.length, 2, "paused customer gets no bot reply");
});

test("when the owner answers from the Business app, the bot steps aside", async () => {
  const { bot, sent } = setup(async () => ({ text: "bot", handoff: null }));
  await bot.handle({ messages: [], echoes: [{ id: "e1", to: "972500000001" }] });
  await bot.handle({ messages: [msg("m1", "תודה")], echoes: [] });
  assert.equal(sent.length, 0);
});

test("if Claude fails, the customer still gets a reply, the owner is told, and the bot is not paused", async () => {
  let fail = true;
  const { bot, sent } = setup(async () => {
    if (fail) throw new Error("overloaded");
    return { text: "חזרתי", handoff: null };
  });
  await bot.handle({ messages: [msg("m1", "שאלה")], echoes: [] });
  assert.equal(sent[0].text, FALLBACK_REPLY);
  assert.equal(sent[1].to, "972599999999");
  fail = false;
  await bot.handle({ messages: [msg("m2", "עוד שאלה")], echoes: [] });
  assert.equal(sent.at(-1).text, "חזרתי");
});

test("the owner testing from their own phone gets answers", async () => {
  const { bot, sent } = setup(async () => ({ text: "x", handoff: null }));
  await bot.handle({ messages: [msg("m1", "test", "972599999999")], echoes: [] });
  assert.equal(sent.length, 1);
});

test("a failed reply to the customer still hands off to the owner", async () => {
  const { bot, sent } = setup(async () => ({ text: "x", handoff: { reason: "refund", summary: "" } }), { failCustomerSend: true });
  await bot.handle({ messages: [msg("m1", "החזר")], echoes: [] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "972599999999");
});

test("stops answering a customer past the hourly limit", async () => {
  const cfg = { ...config, maxRepliesPerHour: 2 };
  const { bot, sent } = setup(async () => ({ text: "x", handoff: null }), { cfg });
  for (let i = 0; i < 4; i++) await bot.handle({ messages: [msg(`m${i}`, "hi")], echoes: [] });
  assert.equal(sent.length, 2);
});

test("the owner's reply from the app goes into the conversation", async () => {
  const { bot, conversations } = setup(async () => ({ text: "x", handoff: null }));
  await bot.handle({ messages: [msg("m1", "יש מקום מחר?")], echoes: [] });
  await bot.handle({ messages: [], echoes: [{ id: "e1", to: "972500000001", text: "כן, ב-10" }] });
  assert.equal(conversations.history("972500000001").at(-1).content, "x\nכן, ב-10");
});

test("several quick messages from one customer become one user turn", () => {
  const conversations = createConversations({ historyTurns: 2 });
  conversations.add("1", "user", "היי");
  conversations.add("1", "user", "יש מקום מחר?");
  assert.deepEqual(conversations.history("1"), [{ role: "user", content: "היי\nיש מקום מחר?" }]);
  for (let i = 0; i < 5; i++) {
    conversations.add("1", "assistant", `a${i}`);
    conversations.add("1", "user", `u${i}`);
  }
  const history = conversations.history("1");
  assert.ok(history.length <= 4);
  assert.equal(history[0].role, "user");
});

test("a pause expires", () => {
  let now = 0;
  const conversations = createConversations({ now: () => now });
  conversations.pause("1", 1);
  assert.equal(conversations.isPaused("1"), true);
  now = 3_600_001;
  assert.equal(conversations.isPaused("1"), false);
});

test("brain sends business.md and turns a handoff_to_human call into a handoff", async () => {
  let request;
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          request = req;
          return {
            stop_reason: "tool_use",
            content: [
              { type: "text", text: "אעביר לצוות" },
              { type: "tool_use", name: "handoff_to_human", input: { reason: "complaint", summary: "late order" } },
            ],
          };
        },
      },
    },
  };
  const brain = createBrain({ businessText: "Pilates studio, Tel Aviv", model: "m", effort: "low", client });
  const result = await brain.reply([{ role: "user", content: "ההזמנה מאחרת" }]);
  assert.match(request.system, /Pilates studio, Tel Aviv/);
  assert.deepEqual(result, { text: "אעביר לצוות", handoff: { reason: "complaint", summary: "late order" } });
});

test("brain treats a refusal as a handoff", async () => {
  const client = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
  const brain = createBrain({ businessText: "x", model: "m", effort: "low", client });
  const result = await brain.reply([{ role: "user", content: "?" }]);
  assert.equal(result.text, FALLBACK_REPLY);
  assert.ok(result.handoff);
});
