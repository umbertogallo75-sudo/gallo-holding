/**
 * The gym. Every exercise is one entry here: the hub page, the routing and the
 * home card all read this list, so adding one is adding a row plus its own
 * page under /palestra/<slug>.
 *
 * These are exercise, not decoration — each declares what it trains, and the
 * ones marked `usesOwnWords` run on the learner's own mistakes and
 * expressions rather than on a generic word list.
 */
export type GameStatus = "live" | "soon";

export type Game = {
  slug: string;
  title: string;
  /** One line, in the app's voice: what you do, not what it is. */
  tagline: string;
  /** What the game actually trains, shown as a small label. */
  trains: string;
  icon: string;
  status: GameStatus;
  usesOwnWords: boolean;
  /** Rough length, shown so nobody starts one without knowing. */
  minutes: number;
};

export const GAMES: Game[] = [
  {
    slug: "four-letters",
    title: "Quattro lettere",
    tagline: "Quattro lettere, una parola vera. Ogni parola ti ridà secondi, ma l'orologio accelera.",
    trains: "Vocabolario · lettura veloce",
    icon: "🔤",
    status: "live",
    usesOwnWords: false,
    minutes: 2,
  },
  {
    slug: "parola-lunga",
    title: "Parola lunga",
    tagline: "Nove lettere, molte parole dentro. Quella che le usa tutte vale il doppio e apre il gruppo dopo.",
    trains: "Vocabolario · parole lunghe",
    icon: "🧩",
    status: "live",
    usesOwnWords: false,
    minutes: 3,
  },
  {
    slug: "ascolta",
    title: "Ascolta e scegli",
    tagline: "Sam pronuncia, tu scegli il significato fra tre. Dieci parole a raffica, un solo cronometro.",
    trains: "Ascolto · comprensione",
    icon: "🎧",
    status: "live",
    usesOwnWords: true,
    minutes: 2,
  },
  {
    slug: "numeri",
    title: "Numeri e cifre",
    tagline: "Sam dice un prezzo, una percentuale, un anno. Tu lo scrivi in cifre, prima che scada.",
    trains: "Ascolto · numeri",
    icon: "🔢",
    status: "live",
    usesOwnWords: false,
    minutes: 2,
  },
  {
    slug: "flash",
    title: "Flash IT ↔ EN",
    tagline: "Un minuto, parole a raffica, e la direzione cambia in continuazione.",
    trains: "Vocabolario · nelle due direzioni",
    icon: "⚡",
    status: "live",
    usesOwnWords: true,
    minutes: 1,
  },
  {
    slug: "errore",
    title: "Trova l'errore",
    tagline: "Una frase, una parola sbagliata. Tocca quella — e spesso la frase l'hai detta tu.",
    trains: "Grammatica · i tuoi errori",
    icon: "🔍",
    status: "live",
    usesOwnWords: true,
    minutes: 2,
  },
  {
    slug: "word-sprint",
    title: "Word Sprint",
    tagline: "Ricomponi la parola prima che scada il tempo. Sono le tue parole, quelle che hai sbagliato.",
    trains: "Vocabolario · ortografia",
    icon: "✍️",
    status: "live",
    usesOwnWords: true,
    minutes: 3,
  },
];

export function findGame(slug: string): Game | null {
  return GAMES.find((game) => game.slug === slug) ?? null;
}

export const LIVE_GAMES = GAMES.filter((game) => game.status === "live");
