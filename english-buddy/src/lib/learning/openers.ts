/**
 * The line that starts a session, which the learner never typed.
 *
 * Every conversation opens by sending Sam an instruction in English — "Start a
 * short natural English conversation with me" — so that his first turn has
 * something to answer. It was being stored as a message from the learner, and
 * that had two consequences nobody had looked at.
 *
 * In the archive, every session opened with a sentence in English attributed
 * to somebody who had opened the app to learn English: testers said the list
 * of past sessions "non si capisce nulla", and this is most of the reason.
 * And a session abandoned two seconds after opening still held two messages,
 * so it counted as a conversation and sat in the list among the real ones.
 *
 * It is an instruction to the coach, not something anybody said. It belongs
 * in the prompt and nowhere else.
 */
export const OPENERS: Record<string, string> = {
  "text-2": "Ask me one quick English question. I only have two minutes.",
  "text-5": "Start a short natural English conversation with me.",
  guided: "Start today's guided Business English session using my learning memory.",
  surprise: "Choose the most useful English exercise for me right now and start immediately.",
  buddy: "Send me your quick question for this moment of the day.",
  essentials: "Teach me essential everyday English. Pick a real situation — like a restaurant, airport or hotel — and start the role-play.",
  zero: "Start today's Start-from-Zero guided micro-lesson. Teach me one useful sentence pattern step by step.",
  mission: "Give me a real-life mission I haven't completed yet and role-play it with me.",
  listen: "Start a listening dictation session. Give me the first sentence to transcribe.",
  review: "Start my rapid review quiz on the items I need to practice.",
  warmup: "I have a meeting or call soon. Warm me up: ask me what it's about.",
  shadow: "Start a shadowing drill. Give me the first sentence to listen to and repeat aloud.",
  briefing: "Give me today's short business read and then ask me about it.",
  levelcheck: "Let's find my starting level with a short friendly chat. Start easy.",
  doc: "Let's work on the document I uploaded. Start with what it is and the words I will need.",
};

/**
 * The line that restarts an interrupted conversation.
 *
 * Resuming used to mean the old messages reappearing and nothing else
 * happening: the learner was looking at a conversation with no sign that the
 * coach remembered it, and the next thing Sam said usually asked about
 * something they had already covered. This asks him to say one line that
 * proves he has the thread — and, like the opener, it is an instruction, not
 * something anybody said, so it is never stored or shown.
 */
export const RESUME_PROMPT =
  "We were interrupted and I am back. Continue our conversation exactly where it stopped: one short line that shows you remember what we were talking about, then carry on with the next step. Do not greet me as if we had just met, do not summarise what we said, and do not ask me again anything I already told you.";

export function openerFor(mode: string): string {
  return OPENERS[mode] ?? OPENERS["text-5"];
}

const SYNTHETIC = new Set([...Object.values(OPENERS), RESUME_PROMPT].map((line) => line.trim()));

/**
 * Recognises one of those lines in stored history.
 *
 * Needed for the conversations that already have one: they are in the
 * database, and a transcript that opens with an instruction the learner never
 * wrote is confusing to read whenever it was written.
 */
export function isSyntheticOpener(text: string): boolean {
  return SYNTHETIC.has(text.trim());
}
