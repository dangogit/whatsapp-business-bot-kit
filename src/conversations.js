// Short-term memory for each customer, kept in the server's memory.
// It is gone after a restart. For a business that needs more, ask Claude Code
// to move it to a database (Postgres, Redis, SQLite on a volume).

// Messages a paused customer keeps sending are merged into one turn; keep only its newest part.
const MAX_TURN_CHARS = 8000;

export function createConversations({ historyTurns = 20, now = () => Date.now() } = {}) {
  const histories = new Map(); // phone -> [{ role, content }]
  const pausedUntil = new Map(); // phone -> timestamp
  const seen = new Set(); // message ids already handled (Meta retries deliveries)
  const queues = new Map(); // phone -> promise, so one customer's messages run in order
  const replies = new Map(); // phone -> timestamps of recent bot replies

  return {
    history: (phone) => histories.get(phone) ?? [],

    add(phone, role, content) {
      const list = histories.get(phone) ?? [];
      const last = list.at(-1);
      // Claude expects user and assistant turns to alternate. Several quick messages
      // from the customer become one turn.
      if (last?.role === role) last.content = `${last.content}\n${content}`.slice(-MAX_TURN_CHARS);
      else list.push({ role, content });

      const max = historyTurns * 2;
      while (list.length > max || (list.length && list[0].role !== "user")) list.shift();
      histories.set(phone, list);
    },

    firstTime(messageId) {
      if (seen.has(messageId)) return false;
      seen.add(messageId);
      if (seen.size > 5000) seen.delete(seen.values().next().value);
      return true;
    },

    pause(phone, hours) {
      pausedUntil.set(phone, now() + hours * 3_600_000);
    },

    isPaused(phone) {
      const until = pausedUntil.get(phone);
      if (!until) return false;
      if (until > now()) return true;
      pausedUntil.delete(phone);
      return false;
    },

    // True while this customer has had fewer than `max` bot replies in the last hour.
    withinRate(phone, max) {
      const hourAgo = now() - 3_600_000;
      const recent = (replies.get(phone) ?? []).filter((t) => t > hourAgo);
      if (recent.length >= max) {
        replies.set(phone, recent);
        return false;
      }
      recent.push(now());
      replies.set(phone, recent);
      return true;
    },

    inOrder(phone, task) {
      const next = (queues.get(phone) ?? Promise.resolve()).then(task, task);
      queues.set(phone, next.catch(() => {}));
      return next;
    },
  };
}
