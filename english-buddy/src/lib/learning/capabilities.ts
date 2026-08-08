/**
 * The 3-month progression is tracked as real-world capabilities, not abstract
 * scores. The coach marks a capability when the user clearly demonstrates it
 * in conversation; the Progress screen shows "You can now / Next targets".
 * Phases map to the roadmap: 1 = foundations, 2 = workplace, 3 = managerial.
 */

export const CAPABILITIES = [
  { key: "introduce_yourself", en: "Introduce yourself: name, job, company", it: "Presentarti: nome, lavoro, azienda", phase: 1 },
  { key: "ask_repeat", en: "Ask someone to repeat or slow down", it: "Chiedere di ripetere o parlare più piano", phase: 1 },
  { key: "understand_numbers", en: "Understand numbers, dates and prices", it: "Capire numeri, date e prezzi", phase: 1 },
  { key: "order_restaurant", en: "Order at a restaurant and ask for the bill", it: "Ordinare al ristorante e chiedere il conto", phase: 1 },
  { key: "travel_basics", en: "Handle airport, taxi and hotel check-in", it: "Cavartela in aeroporto, taxi e hotel", phase: 1 },
  { key: "small_talk", en: "Make simple small talk before a meeting", it: "Fare due chiacchiere prima di una riunione", phase: 1 },
  { key: "describe_company", en: "Explain your company and your role", it: "Descrivere la tua azienda e il tuo ruolo", phase: 2 },
  { key: "describe_problem", en: "Describe a problem and its impact", it: "Descrivere un problema e il suo impatto", phase: 2 },
  { key: "give_opinion", en: "Give an opinion, agree and disagree", it: "Dare un'opinione, essere d'accordo o in disaccordo", phase: 2 },
  { key: "join_meeting", en: "Take part in a simple meeting", it: "Partecipare a una riunione semplice", phase: 2 },
  { key: "schedule_meeting", en: "Propose and schedule a meeting", it: "Proporre e fissare una riunione", phase: 2 },
  { key: "handle_call", en: "Handle a work call in English", it: "Gestire una telefonata di lavoro", phase: 3 },
  { key: "present_numbers", en: "Present revenue, margins and results", it: "Presentare fatturato, margini e risultati", phase: 3 },
  { key: "negotiate_basics", en: "Negotiate the key points of a deal", it: "Negoziare i punti chiave di un accordo", phase: 3 },
  { key: "investor_banking", en: "Talk to investors and banks", it: "Parlare con investitori e banche", phase: 3 },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];
export const capabilityKeys = CAPABILITIES.map((c) => c.key) as string[];

export function isCapabilityKey(value: string): value is CapabilityKey {
  return capabilityKeys.includes(value);
}

/** 1, 2 or 3 — which month of the ~3-month path the user is in. */
export function monthPhase(pathStartedAt: string | null, now: Date = new Date()): 1 | 2 | 3 {
  if (!pathStartedAt) return 1;
  const started = Date.parse(pathStartedAt);
  if (Number.isNaN(started)) return 1;
  const days = Math.floor((now.getTime() - started) / 86_400_000);
  if (days < 30) return 1;
  if (days < 60) return 2;
  return 3;
}

export const PHASE_FOCUS: Record<1 | 2 | 3, string> = {
  1: "FOUNDATIONS: high-frequency sentence patterns, essential listening, introducing oneself, numbers, dates, travel, basic meeting language, asking for repetition/clarification. Goal: survive basic work and travel interactions.",
  2: "WORKPLACE COMMUNICATION: meetings, calls, describing work, explaining problems, opinions, agreeing/disagreeing, simple numbers, projects, schedules, customers, teams, basic negotiation, business small talk. Goal: actively participate in simple professional conversations.",
  3: "MANAGERIAL BUSINESS ENGLISH: leadership, strategy, finance, EBITDA, margins, cash flow, M&A, negotiations, investor meetings, banking, presentations, objections, executive small talk. Goal: function in real international managerial situations.",
};
