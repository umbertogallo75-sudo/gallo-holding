/**
 * Buddy question generation for push notifications. Tries a tiny LLM call for
 * fresh, personalized questions; falls back to a curated pool so the scheduler
 * never fails on upstream errors.
 */
import { modelFor } from "@/lib/ai/models";

/**
 * Every notification carries both languages.
 *
 * The app teaches English to people who do not have it yet, and the daily
 * question arrived in English only — so for the learners it exists for, the
 * one message that reaches them all day was unreadable on the lock screen.
 * The English comes first, because it is the lesson; the Italian is underneath
 * so the question can be understood before the app is even opened.
 *
 * They are kept apart rather than glued together, because only the English
 * seeds the conversation when the notification is tapped.
 */
export type Question = { en: string; it: string };

/** The two lines as a notification body: English first, Italian under it. */
export function bilingualBody(question: Question): string {
  return question.it ? `${question.en}\n${question.it}` : question.en;
}

const POOL: Question[] = [
  { en: "What was the hardest decision you made today?", it: "Qual è stata la decisione più difficile di oggi?" },
  { en: "If you had €10 million to invest today, where would you put it?", it: "Se avessi 10 milioni da investire oggi, dove li metteresti?" },
  { en: "What matters more in business: growth or cash flow?", it: "Conta di più la crescita o la cassa?" },
  { en: "What are you working on this afternoon?", it: "A cosa stai lavorando questo pomeriggio?" },
  { en: "Would you acquire a company with strong revenue but weak margins?", it: "Compreresti un'azienda con molto fatturato ma margini bassi?" },
  { en: "What's one thing you'd change about your typical workday?", it: "Cosa cambieresti della tua giornata tipo?" },
  { en: "How would you describe your company to an investor in one sentence?", it: "Come descriveresti la tua azienda a un investitore, in una frase?" },
  { en: "What was the best piece of advice you ever received?", it: "Qual è il miglior consiglio che ti abbiano mai dato?" },
  { en: "Quick one: coffee meeting or video call — which do you prefer, and why?", it: "Veloce: caffè o videochiamata? E perché?" },
  { en: "What's a risk you're glad you took?", it: "Qual è un rischio che sei contento di aver corso?" },
  { en: "If a bank offered you cheap debt tomorrow, what would you use it for?", it: "Se domani una banca ti offrisse credito a poco, come lo useresti?" },
  { en: "What did you have for lunch — and would you recommend it?", it: "Cosa hai mangiato a pranzo? Lo consiglieresti?" },
  { en: "How do you usually start a difficult negotiation?", it: "Come inizi di solito una trattativa difficile?" },
  { en: "Which country would you most like to do business in, and why?", it: "In quale paese ti piacerebbe fare affari, e perché?" },
  { en: "What's one skill you want your team to improve this year?", it: "Quale competenza vorresti far crescere nel tuo team quest'anno?" },
  { en: "Describe your morning in three sentences.", it: "Descrivi la tua mattinata in tre frasi." },
  { en: "A competitor cuts prices by 20%. What's your move?", it: "Un concorrente taglia i prezzi del 20%. Tu cosa fai?" },
  { en: "What book or article influenced how you think about business?", it: "Quale libro o articolo ha cambiato il tuo modo di vedere il lavoro?" },
  { en: "Where would you travel this weekend if you could leave right now?", it: "Dove andresti questo weekend se potessi partire adesso?" },
  { en: "What makes a meeting worth your time?", it: "Cosa rende una riunione degna del tuo tempo?" },
  { en: "Is it a good moment to raise prices in your sector? Why?", it: "È il momento giusto per alzare i prezzi nel tuo settore? Perché?" },
  { en: "Tell me about a small win you had this week.", it: "Raccontami una piccola vittoria di questa settimana." },
  { en: "How do you decide when to delegate and when to do it yourself?", it: "Come decidi quando delegare e quando fare da solo?" },
  { en: "What would you do with one extra free hour every day?", it: "Cosa faresti con un'ora libera in più ogni giorno?" },
  { en: "You're at a restaurant in London and the waiter arrives. What do you say to order?", it: "Sei a Londra, arriva il cameriere. Come ordini?" },
  { en: "Quick basics: how would you ask for the bill in English, politely?", it: "Base: come chiedi il conto in inglese, con garbo?" },
  { en: "You land at the airport and need a taxi to your hotel. What do you ask the driver?", it: "Atterri e ti serve un taxi per l'hotel. Cosa dici al tassista?" },
  { en: "At hotel check-in they ask for your details. How do you introduce yourself in English?", it: "Al check-in ti chiedono i dati. Come ti presenti in inglese?" },
];

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function poolQuestion(seed: string): Question {
  return POOL[hashCode(seed) % POOL.length];
}

/** 20 generic encouragement banners in rotation; the seed keeps each pick stable. */
export function pickBanner(seed: string): string {
  return `/banners/banner-${String((hashCode(seed) % 20) + 1).padStart(2, "0")}.png`;
}

/**
 * Context-aware banner: matches the notification's topic (from its text) or
 * time window; falls back to the generic rotation when nothing matches.
 * Banners 21-27 are the themed ones (morning, lunch, evening, nudge, food,
 * travel, meetings).
 */
export function bannerForNotification(opts: { question: string; window?: string; kind?: string; seed: string }): string {
  const q = opts.question.toLowerCase();
  if (opts.kind?.startsWith("nudge")) return "/banners/banner-24.png";
  if (/restaurant|waiter|menu|the bill|order(ing)? food|dinner|breakfast|dish|eat/.test(q)) return "/banners/banner-25.png";
  if (/airport|flight|hotel|taxi|travel|trip|luggage|check.?in|gate|abroad/.test(q)) return "/banners/banner-26.png";
  if (/meeting|call|presentation|colleague|agenda|boardroom/.test(q)) return "/banners/banner-27.png";
  if (/negotiat|price|deal|contract|discount|offer/.test(q)) return "/banners/banner-11.png";
  if (/invest|revenue|cash|margin|bank|budget|acquisition|ebitda/.test(q)) return "/banners/banner-10.png";
  if (opts.window === "morning") return "/banners/banner-21.png";
  if (opts.window === "lunch") return "/banners/banner-22.png";
  if (opts.window === "evening") return "/banners/banner-23.png";
  return pickBanner(opts.seed);
}

export type QuestionContext = {
  name?: string | null;
  level?: string | null;
  professionalContext?: string | null;
  recentQuestions: string[];
  // A spaced-repetition expression that is due: the question can invite it.
  dueExpression?: string | null;
};

export async function generateBuddyQuestion(context: QuestionContext, seed: string): Promise<Question> {
  const apiKey = process.env.OPENAI_API_KEY;
  const beginner = !context.level || ["A1", "A2"].includes(context.level);
  const fallback = () => poolQuestion(seed);
  if (!apiKey) return fallback();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelFor("text"),
        instructions: `You are Sam, the user's English coach and English-speaking friend who texts short questions during the day to help an ${context.level || "intermediate"}-level professional practice English naturally.

ANSWER FORMAT — exactly two lines and nothing else:
Line 1: ONE question in English${beginner ? ", max 12 words, very simple" : ", max 18 words"}.
Line 2: the same question in Italian, natural and short.
No quotes, no emoji, no labels, no blank line between them.

Both lines always, whatever their level: this is the only message that reaches them all day, and it is read on a lock screen by somebody who is still learning English. The English is the lesson; the Italian is what makes the lesson legible.

Vary topics across: daily life, opinions, travel, food, business, investments, leadership, negotiation, strategy. Never feel like homework.
Occasionally (about one time in five) ask a practical "essentials" question instead: a real-life situation like ordering at a restaurant, taking a taxi, or checking into a hotel, asking how they would say it in English.
${context.dueExpression ? `They are due to review the expression "${context.dueExpression}": about half the time, shape the question so answering naturally invites using it — without saying it's a review.` : ""}
${context.professionalContext ? `Their background: ${context.professionalContext}.` : ""}
Avoid repeating these recent questions: ${JSON.stringify(context.recentQuestions.slice(0, 6))}`,
        input: `Write the next question for ${context.name || "your friend"}.`,
        // The only model call nobody waits for: a cron writes tomorrow's
        // notifications. Thinking time is free here, so it is bought.
        reasoning: { effort: "medium" },
        // Generous cap: reasoning shares the budget and a truncated response
        // would fall back to the static pool more often than necessary.
        max_output_tokens: 1600,
      }),
    });
    if (!response.ok) return fallback();
    const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
    const text = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
    if (!text || text.length > 320) return fallback();
    const parsed = splitQuestion(text);
    // One line back means the model ignored the format. The pool is bilingual
    // and a notification nobody can read is worse than a repeated one.
    return parsed ?? fallback();
  } catch {
    return fallback();
  }
}

/**
 * Two lines into the two languages.
 *
 * Written defensively because it parses a model's output: anything that is not
 * plainly two non-empty lines is refused, and the caller falls back to the
 * pool rather than sending half a notification.
 */
export function splitQuestion(text: string): Question | null {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|line ?[12][:.]?|italiano[:.]?|english[:.]?)\s*/i, "").trim())
    .map((line) => line.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const [en, it] = lines;
  if (en.length < 4 || it.length < 4) return null;
  return { en, it };
}
