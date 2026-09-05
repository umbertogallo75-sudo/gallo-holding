/**
 * The video manual, and the map that makes it usable.
 *
 * A eighteen-minute film about an app is only worth having if somebody who
 * wants one answer — how do I forward an email? — can be standing at that
 * answer in two taps. So the chapters are data, every one of them has a name
 * that can go in a link, and the page can be sent to somebody already opened
 * at the minute that helps them.
 *
 * The files themselves are not in this repository and must not be: a video is
 * tens of megabytes of bytes that never diff, and Git is the wrong shelf for
 * it. The addresses arrive from the environment, and until they do the page
 * says so honestly instead of showing a broken player.
 */

export type Chapter = { title: string; start: number; slug: string };
export type GuideKey = "manuale" | "sintesi";

export type Guide = {
  key: GuideKey;
  title: string;
  blurb: string;
  /** Whole seconds, for the "quanto dura" line. */
  seconds: number;
  video: string | null;
  captions: string | null;
  chapters: Chapter[];
};

/** `Le tue email di lavoro` → `le-tue-email-di-lavoro`. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function withSlugs(entries: { title: string; start: number }[]): Chapter[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    let slug = slugify(entry.title);
    // Two chapters with the same name would fight over the same link.
    let n = 2;
    while (seen.has(slug)) slug = `${slugify(entry.title)}-${n++}`;
    seen.add(slug);
    return { ...entry, slug };
  });
}

const MANUALE = withSlugs([
  { title: "Una giornata, un coach", start: 0 },
  { title: "Installa, registrati e accedi", start: 21 },
  { title: "Personalizzazione e Home", start: 64 },
  { title: "Scrivi e allenati con Sam", start: 99 },
  { title: "Voce e diario parlato", start: 143 },
  { title: "Il catalogo degli allenamenti", start: 181 },
  { title: "Mi serve adesso: Rescue", start: 240 },
  { title: "Agenda e calendari", start: 269 },
  { title: "Documenti e PDF", start: 318 },
  { title: "Prima, durante e dopo la call", start: 350 },
  { title: "Le tue email di lavoro", start: 380 },
  { title: "Notifiche e comunicazioni", start: 416 },
  { title: "Progressi e frasario", start: 466 },
  { title: "Prova, piani e pagamenti", start: 502 },
  { title: "Profilo, impostazioni e dati", start: 591 },
  { title: "Aziende, partner e prossimo passo", start: 647 },
]);

const SINTESI = withSlugs([
  { title: "Il tuo inglese al lavoro", start: 0 },
  { title: "Account e primo percorso", start: 13 },
  { title: "Allenati con Sam", start: 27 },
  { title: "Prima, durante e dopo il lavoro", start: 50 },
  { title: "Continua e ritrova il filo", start: 96 },
  { title: "Prova, piani e pagamento", start: 114 },
  { title: "Preferenze, team e prossimo passo", start: 150 },
]);

function url(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function guides(): Guide[] {
  return [
    {
      key: "manuale",
      title: "Guida completa",
      blurb: "Tutta l'app, un passaggio alla volta: dalla registrazione ai pagamenti, senza saltare niente.",
      seconds: 693,
      video: url(process.env.NEXT_PUBLIC_GUIDE_FULL_URL),
      captions: url(process.env.NEXT_PUBLIC_GUIDE_FULL_VTT),
      chapters: MANUALE,
    },
    {
      key: "sintesi",
      title: "In tre minuti",
      blurb: "Se hai poco tempo: cosa fa ExecLingo e come si comincia.",
      seconds: 180,
      video: url(process.env.NEXT_PUBLIC_GUIDE_SHORT_URL),
      captions: url(process.env.NEXT_PUBLIC_GUIDE_SHORT_VTT),
      chapters: SINTESI,
    },
  ];
}

/** Whether there is anything to watch at all. */
export function guideIsPublished(): boolean {
  return guides().some((guide) => guide.video);
}

/** `693` → `11:33`. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The guide and moment a link is asking for, taking nothing on trust. */
export function resolveDeepLink(
  params: { v?: string; c?: string },
  all: Guide[] = guides()
): { guide: Guide; chapter: Chapter | null } {
  const guide = all.find((g) => g.key === params.v) ?? all[0];
  const chapter = params.c ? guide.chapters.find((c) => c.slug === params.c) ?? null : null;
  return { guide, chapter };
}
