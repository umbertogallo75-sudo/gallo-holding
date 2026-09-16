import { CAPABILITIES, type CapabilityKey } from "./capabilities";
import { skillNames, type SkillName } from "@/lib/ai/types";

/**
 * The path, as the person walking it sees it.
 *
 * Everything needed for this already existed inside the coach: fifteen
 * capabilities across three months, eight skill estimates Sam moves a point at
 * a time, a weekly focus. None of it was ever arranged into a route, and none
 * of it answered the two questions a person actually asks — where am I, and
 * what happens next. Testers said it plainly: the sessions do not add up to a
 * path, and there is no way to see one.
 *
 * So: six stages of two weeks, built out of the capabilities that already
 * exist, and then a seventh that never ends — because somebody who already
 * speaks English still has a whole professional vocabulary to earn, and a
 * path that finishes at week twelve tells them the opposite.
 */

export type Stage = {
  key: string;
  /** Inclusive week range within the three months. */
  weeks: [number, number];
  title: string;
  /** What you can do when it is done, in the learner's language. */
  goal: string;
  capabilities: CapabilityKey[];
  /** The activity that works on exactly this. */
  href: string;
  action: string;
};

export const STAGES: Stage[] = [
  {
    key: "basi",
    weeks: [1, 2],
    title: "Le basi che servono subito",
    goal: "Presentarti, chiedere di ripetere senza imbarazzo, capire numeri, date e prezzi al volo.",
    capabilities: ["introduce_yourself", "ask_repeat", "understand_numbers"],
    href: "/buddy?mode=zero",
    action: "Micro-lezione guidata",
  },
  {
    key: "fuori",
    weeks: [3, 4],
    title: "Fuori dall'ufficio",
    goal: "Aeroporto, hotel, taxi, ristorante — e due chiacchiere prima che la riunione cominci.",
    capabilities: ["order_restaurant", "travel_basics", "small_talk"],
    href: "/buddy?mode=essentials",
    action: "Situazioni reali",
  },
  {
    key: "lavoro",
    weeks: [5, 6],
    title: "Raccontare il tuo lavoro",
    goal: "Spiegare cosa fa la tua azienda, cosa fai tu, e descrivere un problema con il suo impatto.",
    capabilities: ["describe_company", "describe_problem"],
    href: "/buddy?mode=guided",
    action: "Sessione guidata",
  },
  {
    key: "riunioni",
    weeks: [7, 8],
    title: "Dentro la riunione",
    goal: "Dire la tua, essere d'accordo o no, intervenire, e fissare il prossimo incontro.",
    capabilities: ["give_opinion", "join_meeting", "schedule_meeting"],
    href: "/riunione",
    action: "Preparazione riunione",
  },
  {
    key: "call",
    weeks: [9, 10],
    title: "Telefonate e numeri",
    goal: "Reggere una call di lavoro e presentare fatturato, margini e risultati senza perderti.",
    capabilities: ["handle_call", "present_numbers"],
    href: "/voice",
    action: "Conversazione a voce",
  },
  {
    key: "trattativa",
    weeks: [11, 12],
    title: "Trattativa e investitori",
    goal: "Negoziare i punti che contano e parlare con banche e investitori.",
    capabilities: ["negotiate_basics", "investor_banking"],
    href: "/buddy?mode=mission",
    action: "Missione",
  },
];

/** Weeks the mapped path lasts. After this it continues, differently. */
export const PATH_WEEKS = 12;

/**
 * The stage that has no end.
 *
 * "Anche se già parla inglese potrà sempre migliorare": a path that stops at
 * week twelve says the opposite, and the people most likely to pay are the
 * ones who already speak some English. This one is measured in the vocabulary
 * of their own trade rather than in boxes ticked.
 */
export const OPEN_STAGE = {
  key: "mestiere",
  title: "Il tuo inglese, sul tuo mestiere",
  goal: "Da qui non si tratta più di cavarsela: si tratta dei termini esatti del tuo lavoro, nelle situazioni in cui li useresti davvero.",
  href: "/buddy?mode=briefing",
  action: "Lettura di lavoro",
} as const;

export type StageState = "done" | "current" | "todo";

export type StageProgress = Stage & {
  state: StageState;
  /** Capabilities demonstrated in this stage. */
  achieved: number;
  total: number;
};

/** Which week of the path somebody is in. Never below 1. */
export function weekOfPath(pathStartedAt: string | null, now: Date = new Date()): number {
  if (!pathStartedAt) return 1;
  const started = Date.parse(pathStartedAt.includes("T") ? pathStartedAt : pathStartedAt.replace(" ", "T") + "Z");
  if (Number.isNaN(started)) return 1;
  const days = Math.floor((now.getTime() - started) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/**
 * The stages, with what has actually been demonstrated in each.
 *
 * "Current" is the first stage that is not finished, not the one the calendar
 * says you should be on. Time does not complete a stage, and a person who has
 * been away for a fortnight should come back to the thing they were doing
 * rather than to a stage they skipped.
 */
export function stageProgress(achievedKeys: Iterable<string>): StageProgress[] {
  const achieved = new Set(achievedKeys);
  let currentTaken = false;
  return STAGES.map((stage) => {
    const count = stage.capabilities.filter((key) => achieved.has(key)).length;
    const complete = count === stage.capabilities.length;
    let state: StageState = "todo";
    if (complete) state = "done";
    else if (!currentTaken) {
      state = "current";
      currentTaken = true;
    }
    return { ...stage, state, achieved: count, total: stage.capabilities.length };
  });
}

/** How far along the path really is: demonstrated, not elapsed. */
export function pathPercent(achievedKeys: Iterable<string>): number {
  const achieved = new Set(achievedKeys);
  const total = CAPABILITIES.length;
  const done = CAPABILITIES.filter((c) => achieved.has(c.key)).length;
  return Math.round((done / total) * 100);
}

/** Where the calendar says you are, as a percentage of the mapped path. */
export function timePercent(week: number): number {
  return Math.min(100, Math.round((Math.max(1, week) / PATH_WEEKS) * 100));
}

/**
 * The one honest sentence about the gap between the two.
 *
 * Shown because hiding it is how a progress screen becomes decoration: if the
 * calendar is at week nine and three capabilities are demonstrated, saying so
 * is the only useful thing on the page.
 */
export function pace(week: number, percent: number): { tone: "ahead" | "on" | "behind" | "over"; text: string } {
  if (week > PATH_WEEKS) {
    return {
      tone: "over",
      text: percent >= 90
        ? "Hai completato il percorso mappato. Da qui si continua sul tuo mestiere: vocabolario preciso, situazioni vere."
        : "Le dodici settimane sono passate: nessun problema, il percorso non scade. Riprendi dalla tappa in corso.",
    };
  }
  const expected = timePercent(week);
  if (percent >= expected + 10) return { tone: "ahead", text: "Sei avanti rispetto al calendario. Sam può alzare l'asticella: chiediglielo." };
  if (percent >= expected - 15) return { tone: "on", text: "Sei in linea con il percorso. Continua così: bastano pochi minuti al giorno." };
  return {
    tone: "behind",
    text: "Sei indietro rispetto al calendario — succede, e si recupera: le tappe si superano parlando, non aspettando.",
  };
}

/* ─────────────────────────── Il pagellino ─────────────────────────── */

/**
 * Marks out of ten, from the estimates Sam has been moving all along.
 *
 * These are not a new judgement invented for a report card: every one of them
 * is the running estimate the coach adjusts by a point or two at the end of
 * each turn, on evidence from that turn. Showing them out of ten is the whole
 * change — a bar with "62" on it says nothing to anybody, and a 6 says
 * everything.
 */
export type Mark = {
  skill: SkillName;
  label: string;
  /** 1 to 10, in halves. */
  mark: number;
  /** What this mark means, in plain Italian. */
  meaning: string;
  /** The single most useful thing to do to raise it. */
  advice: string;
  href: string;
};

const SKILL_LABELS: Record<SkillName, string> = {
  listening: "Ascolto",
  speaking: "Parlato",
  business_conversation: "Inglese di lavoro",
  vocabulary: "Vocabolario",
  grammar: "Grammatica",
  pronunciation: "Pronuncia",
  fluency: "Scioltezza",
  comprehension: "Comprensione",
};

const SKILL_ADVICE: Record<SkillName, { advice: string; href: string }> = {
  listening: { advice: "Ascolta e scrivi: dettature brevi, una frase alla volta.", href: "/buddy?mode=listen" },
  speaking: { advice: "Parla a voce con Sam: cinque minuti valgono un'ora di lettura.", href: "/voice" },
  business_conversation: { advice: "Fai una sessione guidata sul tuo lavoro vero.", href: "/buddy?mode=guided" },
  vocabulary: { advice: "Palestra e frasario: le parole che hai già incontrato tornano.", href: "/palestra" },
  grammar: { advice: "Trova l'errore: sono le tue frasi, non quelle di un libro.", href: "/palestra" },
  pronunciation: { advice: "Shadowing: ripeti ad alta voce imitando il ritmo.", href: "/buddy?mode=shadow" },
  fluency: { advice: "Conversazione libera a voce, senza fermarti a cercare la parola giusta.", href: "/voice" },
  comprehension: { advice: "Lettura di lavoro: un testo corto e due domande.", href: "/buddy?mode=briefing" },
};

/** 0-100 becomes 1-10, in halves, never zero: nobody is a zero. */
export function markOf(value: number): number {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
  return Math.max(1, Math.round((bounded / 10) * 2) / 2);
}

export function meaningOf(mark: number): string {
  if (mark >= 9) return "Ci sei: qui sei autonomo anche sotto pressione.";
  if (mark >= 7.5) return "Solido. Regge nelle situazioni vere, con qualche incertezza.";
  if (mark >= 6) return "Sufficiente: te la cavi, ma ti costa fatica.";
  if (mark >= 4.5) return "In costruzione: qui è dove si guadagna di più, adesso.";
  return "Da costruire: è il punto più fragile, e per questo il più redditizio.";
}

export function marksFrom(state: Record<string, unknown> | null | undefined): Mark[] {
  return skillNames.map((skill) => {
    const mark = markOf(Number(state?.[skill] ?? 50));
    return {
      skill,
      label: SKILL_LABELS[skill],
      mark,
      meaning: meaningOf(mark),
      advice: SKILL_ADVICE[skill].advice,
      href: SKILL_ADVICE[skill].href,
    };
  });
}

/** The average, to one decimal — the number people look at first. */
export function averageMark(marks: Mark[]): number {
  if (!marks.length) return 0;
  return Math.round((marks.reduce((sum, m) => sum + m.mark, 0) / marks.length) * 10) / 10;
}

/** The two weakest marks: where the next sessions should go. */
export function weakest(marks: Mark[], count = 2): Mark[] {
  return [...marks].sort((a, b) => a.mark - b.mark).slice(0, count);
}
