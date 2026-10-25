// What happens to each webhook: answer customers, hand off to a human, and step aside
// when the owner answers from the WhatsApp Business app.

import { FALLBACK_REPLY } from "./brain.js";

const MAX_MESSAGE_CHARS = 4000;
// Names and summaries come from the customer (directly or through Claude), so the owner alert
// gets them on one line, short, and without links a customer could use to phish the owner.
// WhatsApp also links bare domains (evil.co/login), so after normalizing look-alike characters and
// removing invisible ones, every dot becomes "[.]", which no linkifier reads as a domain.
const clip = (text, max) =>
  String(text ?? "")
    .normalize("NFKC")
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, "")
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[קישור הוסר]")
    .replace(/[.。．｡․‥…]/g, "[.]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function createBot({ brain, sender, conversations, config, log = console }) {
  async function handleMessage(msg) {
    if (!conversations.firstTime(msg.id)) return; // Meta sometimes delivers the same message twice

    conversations.add(msg.from, "user", msg.text.slice(0, MAX_MESSAGE_CHARS));

    if (conversations.isPaused(msg.from)) {
      log.info(`[bot] ${msg.from} is with a human, not answering`);
      return;
    }
    if (!conversations.withinRate(msg.from, config.maxRepliesPerHour)) {
      // Protects the Anthropic bill from a loop with another bot or a spammer.
      log.warn(`[bot] ${msg.from} passed ${config.maxRepliesPerHour} replies this hour, not answering`);
      return;
    }

    if (config.typingIndicator) {
      await sender.showTyping(msg.id).catch((err) => log.warn(`[bot] typing indicator: ${err.message}`));
    }

    let result;
    let claudeFailed = false;
    try {
      result = await brain.reply(conversations.history(msg.from));
    } catch (err) {
      // If Claude is unreachable the customer still gets an answer and the owner hears about it,
      // but the bot is not paused: the next message tries Claude again.
      log.error(`[bot] Claude failed: ${err.message}`);
      claudeFailed = true;
      result = { text: FALLBACK_REPLY, handoff: { reason: "הבוט לא הצליח להגיע ל-Claude", summary: msg.text } };
    }

    try {
      await sender.sendText(msg.from, result.text);
      conversations.add(msg.from, "assistant", result.text);
    } catch (err) {
      log.error(`[bot] could not reply to ${msg.from}: ${err.message}`);
    }

    if (result.handoff) await handOff(msg, result.handoff, { pause: !claudeFailed });
  }

  async function handOff(msg, { reason, summary }, { pause }) {
    if (pause) conversations.pause(msg.from, config.handoffPauseHours);
    log.info(`[bot] handoff ${msg.from}: ${reason}`);
    if (!config.ownerPhone) return;

    const note = [
      `🙋 לקוח צריך אותך`,
      `${clip(msg.name, 60) || "לקוח"}: +${msg.from}`,
      `למה: ${clip(reason, 200)}`,
      summary && `מה הוא רוצה: ${clip(summary, 300)}`,
      pause && `הבוט לא יענה ללקוח הזה ${config.handoffPauseHours} שעות.`,
    ].filter(Boolean).join("\n");

    // WhatsApp delivers this only if the owner's phone messaged the business number in the last
    // 24 hours. Otherwise Meta accepts the send and reports failure 131047 later in a status
    // webhook, which handle() logs below.
    await sender.sendText(config.ownerPhone, note)
      .catch((err) => log.warn(`[bot] could not notify the owner: ${err.message}`));
  }

  return {
    async handle({ messages, echoes, failures = [] }) {
      for (const echo of echoes) {
        // The owner replied from the WhatsApp Business app: let them talk, and remember what they said.
        conversations.pause(echo.to, config.handoffPauseHours);
        if (echo.text) conversations.add(echo.to, "assistant", echo.text.slice(0, MAX_MESSAGE_CHARS));
        log.info(`[bot] owner replied to ${echo.to}, bot paused`);
      }
      for (const f of failures) {
        const hint = f.code === 131047 && f.to === config.ownerPhone
          ? " (the owner's phone has not messaged the business number in 24 hours)"
          : "";
        log.warn(`[bot] WhatsApp could not deliver to ${f.to}: ${f.code} ${f.title}${hint}`);
      }
      await Promise.all(
        messages.map((msg) =>
          conversations.inOrder(msg.from, () => handleMessage(msg))
            .catch((err) => log.error(`[bot] message ${msg.id}: ${err.message}`)),
        ),
      );
    },
  };
}
