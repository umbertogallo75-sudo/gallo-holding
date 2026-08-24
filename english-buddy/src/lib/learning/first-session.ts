/**
 * Which session gets proposed, from what the learner just told us.
 *
 * The home screen used to ask "what can you do right now?" and offer sixteen
 * answers. This is the other half of removing that question: given a starting
 * level, a reason for learning and the minutes available, there is one
 * sensible thing to do next, and the app should simply do it.
 *
 * The rules are deliberately readable rather than clever. Somebody who starts
 * from zero gets the guided path whatever their goal, because a beginner
 * cannot role-play a negotiation; somebody travelling gets the practical
 * scenarios; somebody with a base and a deal to close gets the negotiation.
 * Everything else falls back to a conversation of the right length.
 */

export type SessionPick = { mode: string; title: string; why: string };

/** The written conversation sized to the minutes on offer. */
function conversation(minutes: number): string {
  if (minutes <= 2) return "text-2";
  if (minutes >= 15) return "guided";
  return "text-5";
}

export function pickFirstSession(
  startingLevel: string | null,
  goal: string | null,
  dailyMinutes: number
): SessionPick {
  const level = startingLevel ?? "independent";
  const why = goal ?? "Riunioni e call";

  if (level === "zero" || level === "basics") {
    return {
      mode: "zero",
      title: "Le prime frasi che userai davvero",
      why: "Parti da zero: una struttura per volta, con l'italiano sotto.",
    };
  }

  if (why === "Viaggi di lavoro") {
    return {
      mode: "essentials",
      title: "Cavartela in viaggio",
      why: "Aeroporto, hotel, ristorante: le frasi che servono sul posto.",
    };
  }

  if (why === "Trattative e clienti") {
    return level === "business"
      ? { mode: "negotiation", title: "Simulazione di trattativa", why: "Prezzi, tempi, obiezioni: Sam fa la controparte." }
      : { mode: "mission", title: "Una missione con un cliente", why: "Un obiettivo per scena, con Sam dall'altra parte." };
  }

  const mode = conversation(dailyMinutes);
  return {
    mode,
    title: mode === "guided" ? "Sessione guidata" : "Due parole con Sam",
    why: "Si comincia parlando: da lì Sam capisce dove intervenire.",
  };
}
