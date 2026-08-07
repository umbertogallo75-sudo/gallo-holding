export type CoachMistake = { incorrect: string; correct: string; category: "grammar"|"vocabulary"|"word_order"|"register"|"other"; note?: string };
export type CoachResult = { reply: string; correction?: string; mistakes: CoachMistake[]; expressions: { expression:string; meaning?:string }[]; skill_updates: Record<string, number> };
