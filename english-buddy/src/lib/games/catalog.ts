/**
 * The games department. Every game is one entry here: the hub page, the
 * routing and the home rail all read this list, so adding a game is adding a
 * row plus its own page under /giochi/<slug>.
 *
 * Games are exercise, not decoration — each one declares what it trains, and
 * the ones marked `usesOwnWords` are played on the learner's own mistakes and
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
    slug: "word-sprint",
    title: "Word Sprint",
    tagline: "Ricomponi la parola prima che scada il tempo. Sono le tue parole, quelle che hai sbagliato.",
    trains: "Vocabolario · ortografia",
    icon: "⚡",
    status: "live",
    usesOwnWords: true,
    minutes: 3,
  },
];

export function findGame(slug: string): Game | null {
  return GAMES.find((game) => game.slug === slug) ?? null;
}

export const LIVE_GAMES = GAMES.filter((game) => game.status === "live");
