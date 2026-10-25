// The part that thinks: sends the conversation to Claude together with business.md,
// and decides whether to answer or hand the customer to a human.

import Anthropic from "@anthropic-ai/sdk";

const RULES = `You answer WhatsApp messages from customers on behalf of the business described below.

How to answer:
- Reply in the customer's language. Keep it short and warm, the way a person types on WhatsApp.
- Use only plain text. WhatsApp shows *bold* and _italic_, nothing else: no headings, no tables, no links in markdown.
- Answer only from the business information below. Never invent prices, hours, availability, policies or promises.
- You only help with this business. If someone asks for something unrelated, say politely that you can only help with questions about the business.

When to call handoff_to_human:
- The customer asks for a person, is upset, or has a complaint.
- The answer is not in the business information, or you would have to guess.
- Anything involving payment problems, refunds, medical, legal or personal-safety issues.
- The business information says a topic always goes to a human.
When you call it, also write a short message telling the customer that someone from the team will get back to them.`;

const HANDOFF_TOOL = {
  name: "handoff_to_human",
  description:
    "Pass this conversation to the business owner. The bot stops answering this customer until the owner takes over.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why a human is needed, in one sentence." },
      summary: { type: "string", description: "What the customer wants, for the owner, in one or two sentences." },
    },
    required: ["reason", "summary"],
    additionalProperties: false,
  },
};

// Sent when Claude cannot answer. Set FALLBACK_REPLY in .env to change it.
export const FALLBACK_REPLY = process.env.FALLBACK_REPLY || "תודה על ההודעה! מישהו מהצוות יחזור אליך בהקדם 🙏";

// The base URL is pinned so an ANTHROPIC_BASE_URL meant for another tool (Claude Code sets one
// in its own shell) cannot redirect the bot's traffic.
const defaultClient = () =>
  new Anthropic({ baseURL: process.env.BOT_ANTHROPIC_BASE_URL || "https://api.anthropic.com" });

export function createBrain({ businessText, model, effort, client = defaultClient() }) {
  const system = `${RULES}\n\n<business_information>\n${businessText}\n</business_information>`;

  return {
    // history: [{ role: "user" | "assistant", content: string }], ending with the customer's turn.
    // Returns { text, handoff } where handoff is null or { reason, summary }.
    async reply(history) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 2000,
        system,
        messages: history,
        tools: [HANDOFF_TOOL],
        output_config: { effort },
        cache_control: { type: "ephemeral" }, // business.md is resent every time, so cache it
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // if the model declines, the API retries on its recommended fallback
      });

      if (response.stop_reason === "refusal") {
        return { text: FALLBACK_REPLY, handoff: { reason: "Claude סירב לענות.", summary: "" } };
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const call = response.content.find((block) => block.type === "tool_use" && block.name === HANDOFF_TOOL.name);

      return {
        text: text || FALLBACK_REPLY,
        handoff: call ? { reason: call.input.reason ?? "", summary: call.input.summary ?? "" } : null,
      };
    },
  };
}
