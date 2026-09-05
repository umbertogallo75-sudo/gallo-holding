import manualChapters from "../../public/marketing/guide/ExecLingo_Manuale-capitoli.json";
import shortChapters from "../../public/marketing/guide/ExecLingo_Sintesi_3min-capitoli.json";

export type Chapter = { title: string; start: number; end: number; slug: string };
export type GuideKey = "manuale" | "sintesi";
export type Guide = {
  key: GuideKey; title: string; blurb: string; seconds: number;
  youtube: string | null; captions: string; subtitles: string;
  chapterFile: string; chapters: Chapter[];
};

export function slugify(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function withSlugs(entries: { title: string; start: number; end: number }[]): Chapter[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    let slug = slugify(entry.title);
    let n = 2;
    while (seen.has(slug)) slug = `${slugify(entry.title)}-${n++}`;
    seen.add(slug);
    return { ...entry, slug };
  });
}

/** Accept only a YouTube ID or a URL on an actual YouTube host. */
export function youtubeId(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = parsed.pathname.split("/")[1];
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"].includes(host)) {
      id = parsed.pathname === "/watch" ? parsed.searchParams.get("v")
        : parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})\/?$/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Published, approved films. An explicit empty override disables a film. */
export function guides(): Guide[] {
  return [
    {
      key: "manuale", title: "Manuale completo", seconds: 693,
      blurb: "Tutta l’app, dalla registrazione alle impostazioni. Scegli il passaggio che ti serve.",
      youtube: youtubeId(process.env.NEXT_PUBLIC_GUIDE_FULL_YT ?? "_MUhXil1lek"),
      captions: "/marketing/guide/ExecLingo_Manuale.vtt", subtitles: "/marketing/guide/ExecLingo_Manuale.srt",
      chapterFile: "/marketing/guide/ExecLingo_Manuale-capitoli.json", chapters: withSlugs(manualChapters.chapters),
    },
    {
      key: "sintesi", title: "Sintesi", seconds: 180,
      blurb: "Il quadro d’insieme in tre minuti. Per approfondire, passa al manuale completo.",
      youtube: youtubeId(process.env.NEXT_PUBLIC_GUIDE_SHORT_YT ?? "dEGY0PMMO7M"),
      captions: "/marketing/guide/ExecLingo_Sintesi_3min.vtt", subtitles: "/marketing/guide/ExecLingo_Sintesi_3min.srt",
      chapterFile: "/marketing/guide/ExecLingo_Sintesi_3min-capitoli.json", chapters: withSlugs(shortChapters.chapters),
    },
  ];
}

export function guideIsPublished(): boolean { return guides().some((guide) => guide.youtube); }
export function clock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
export function resolveDeepLink(params: { v?: string; c?: string }, all: Guide[] = guides()) {
  const guide = all.find((g) => g.key === params.v) ?? all[0];
  const chapter = params.c ? guide.chapters.find((c) => c.slug === params.c) ?? null : null;
  return { guide, chapter };
}
export function currentChapter(chapters: Chapter[], seconds: number): Chapter | null {
  return chapters.reduce<Chapter | null>((found, chapter) => chapter.start <= seconds ? chapter : found, null);
}

const synonyms: Record<string, string> = {
  "email": "mail inoltrare posta risposta",
  "pagament": "pagamento abbonamento prezzo rinnovo acquisto carta stripe apple google",
  "notifiche": "notifica promemoria permesso comunicazioni",
  "calendari": "calendario agenda outlook google icloud",
  "call": "riunione telefono lavoro",
};
const normalize = (value: string) => value.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function matchingChapters(chapters: Chapter[], query: string) {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return chapters.map((chapter, index) => ({ chapter, index })).filter(({ chapter }) => {
    const title = normalize(chapter.title);
    const text = title + " " + Object.entries(synonyms).filter(([key]) => title.includes(key)).map(([, words]) => words).join(" ");
    return terms.every((term) => text.includes(term));
  });
}
export function youtubeWatchUrl(guide: Guide, seconds = 0): string | null {
  if (!guide.youtube) return null;
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(Math.floor(seconds), guide.seconds - 1)) : 0;
  return `https://www.youtube.com/watch?v=${guide.youtube}&t=${time}s`;
}
