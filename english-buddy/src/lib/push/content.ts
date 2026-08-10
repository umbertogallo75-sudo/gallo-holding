/**
 * Buddy question generation for push notifications. Tries a tiny LLM call for
 * fresh, personalized questions; falls back to a curated pool so the scheduler
 * never fails on upstream errors.
 */

const POOL = [
  "What was the hardest decision you made today?",
  "If you had €10 million to invest today, where would you put it?",
  "What matters more in business: growth or cash flow?",
  "What are you working on this afternoon?",
  "Would you acquire a company with strong revenue but weak margins?",
  "What's one thing you'd change about your typical workday?",
  "How would you describe your company to an investor in one sentence?",
  "What was the best piece of advice you ever received?",
  "Quick one: coffee meeting or video call — which do you prefer, and why?",
  "What's a risk you're glad you took?",
  "If a bank offered you cheap debt tomorrow, what would you use it for?",
  "What did you have for lunch — and would you recommend it?",
  "How do you usually start a difficult negotiation?",
  "Which country would you most like to do business in, and why?",
  "What's one skill you want your team to improve this year?",
  "Describe your morning in three sentences.",
  "A competitor cuts prices by 20%. What's your move?",
  "What book or article influenced how you think about business?",
  "Where would you travel this weekend if you could leave right now?",
  "What makes a meeting worth your time?",
  "Is it a good moment to raise prices in your sector? Why?",
  "Tell me about a small win you had this week.",
  "How do you decide when to delegate and when to do it yourself?",
  "What would you do with one extra free hour every day?",
  "You're at a restaurant in London and the waiter arrives. What do you say to order?",
  "Quick basics: how would you ask for the bill in English, politely?",
  "You land at the airport and need a taxi to your hotel. What do you ask the driver?",
  "At hotel check-in they ask for your details. How do you introduce yourself in English?",
] as const;

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function poolQuestion(seed: string): string {
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

export async function generateBuddyQuestion(context: QuestionContext, seed: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  // Beginners can't yet read an English-only notification: give them an
  // Italian lead-in and translation so every notification is understandable.
  const beginner = !context.level || ["A1", "A2"].includes(context.level);
  const fallback = () => (beginner ? `Prova a rispondere in inglese 💪 ${poolQuestion(seed)}` : poolQuestion(seed));
  if (!apiKey) return fallback();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        instructions: `You are Sam, the user's English coach and English-speaking friend who texts short questions during the day to help an ${context.level || "intermediate"}-level professional practice English naturally.
${
  beginner
    ? "THEY ARE A BEGINNER and may not understand English-only messages. Format the notification EXACTLY as: a tiny friendly Italian lead-in (2-5 words, e.g. 'Domanda veloce per te:'), then ONE short English question (max 12 words), then its Italian translation in parentheses. Total under 40 words, plain text only (no quotes, no emoji)."
    : "Write ONE question, max 22 words, plain text only (no quotes, no emoji)."
}
Vary topics across: daily life, opinions, travel, food, business, investments, leadership, negotiation, strategy. Never feel like homework.
Occasionally (about one time in five) ask a practical "essentials" question instead: a real-life situation like ordering at a restaurant, taking a taxi, or checking into a hotel, asking how they would say it in English.
${context.dueExpression ? `They are due to review the expression "${context.dueExpression}": about half the time, shape the question so answering naturally invites using it — without saying it's a review.` : ""}
${context.professionalContext ? `Their background: ${context.professionalContext}.` : ""}
Avoid repeating these recent questions: ${JSON.stringify(context.recentQuestions.slice(0, 6))}`,
        input: `Write the next question for ${context.name || "your friend"}.`,
        reasoning: { effort: "low" },
        // Generous cap: reasoning shares the budget and a truncated response
        // would fall back to the static pool more often than necessary.
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) return fallback();
    const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
    const text = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
    if (!text || text.length > 260) return fallback();
    return text.replace(/^"|"$/g, "");
  } catch {
    return fallback();
  }
}
