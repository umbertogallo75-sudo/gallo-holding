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

export type QuestionContext = {
  name?: string | null;
  level?: string | null;
  professionalContext?: string | null;
  recentQuestions: string[];
};

export async function generateBuddyQuestion(context: QuestionContext, seed: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return poolQuestion(seed);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: `You are English Buddy, an English-speaking friend who texts short questions during the day to help an ${context.level || "intermediate"}-level professional practice English naturally.
Write ONE question, max 22 words, plain text only (no quotes, no emoji).
Vary topics across: daily life, opinions, travel, food, business, investments, leadership, negotiation, strategy. Never feel like homework.
Occasionally (about one time in five) ask a practical "essentials" question instead: a real-life situation like ordering at a restaurant, taking a taxi, or checking into a hotel, asking how they would say it in English.
${context.professionalContext ? `Their background: ${context.professionalContext}.` : ""}
Avoid repeating these recent questions: ${JSON.stringify(context.recentQuestions.slice(0, 6))}`,
        input: `Write the next question for ${context.name || "your friend"}.`,
        reasoning: { effort: "low" },
        max_output_tokens: 300,
      }),
    });
    if (!response.ok) return poolQuestion(seed);
    const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
    const text = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
    if (!text || text.length > 220) return poolQuestion(seed);
    return text.replace(/^"|"$/g, "");
  } catch {
    return poolQuestion(seed);
  }
}
