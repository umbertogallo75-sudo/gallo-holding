import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clock, currentChapter, guideIsPublished, guides, matchingChapters, resolveDeepLink, slugify, youtubeId, youtubeWatchUrl } from "@/lib/guide";

const all = guides();
afterEach(() => vi.unstubAllEnvs());

describe("the video manual", () => {
  it("gives every chapter a name that can travel in a link", () => {
    const slugs = all.flatMap((guide) => guide.chapters.map((chapter) => chapter.slug));
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
    for (const guide of all) {
      const inside = guide.chapters.map((chapter) => chapter.slug);
      expect(new Set(inside).size, `capitoli con lo stesso link in ${guide.key}`).toBe(inside.length);
    }
  });

  it("strips the accents rather than the words", () => {
    expect(slugify("Però, così")).toBe("pero-cosi");
    expect(slugify("Le tue email di lavoro")).toBe("le-tue-email-di-lavoro");
  });

  it("keeps the chapters in order and inside the film", () => {
    for (const guide of all) {
      const starts = guide.chapters.map((chapter) => chapter.start);
      expect(starts, guide.key).toEqual([...starts].sort((a, b) => a - b));
      expect(starts[0]).toBe(0);
      expect(Math.max(...starts)).toBeLessThan(guide.seconds);
    }
  });

  it("reads a deep link, and shrugs off a broken one", () => {
    const wanted = resolveDeepLink({ v: "manuale", c: "le-tue-email-di-lavoro" }, all);
    expect(wanted.guide.key).toBe("manuale");
    expect(wanted.chapter?.start).toBeCloseTo(380.4641950113379, 9);

    // Nothing here may throw: these values come from a URL somebody typed.
    expect(resolveDeepLink({ v: "../../etc", c: "nope" }, all).guide.key).toBe("manuale");
    expect(resolveDeepLink({}, all).chapter).toBeNull();
    // A chapter belongs to its own guide, never to the other one.
    expect(resolveDeepLink({ v: "sintesi", c: "le-tue-email-di-lavoro" }, all).chapter).toBeNull();
  });

  it("takes the eleven characters out of whatever gets pasted", () => {
    // Nobody copies a bare id. All four of these are what people actually paste.
    expect(youtubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("")).toBeNull();
    expect(youtubeId("https://www.youtube.com/")).toBeNull();
    expect(youtubeId(undefined)).toBeNull();
  });

  it("uses the two approved published films without requiring deployment secrets", () => {
    vi.stubEnv("NEXT_PUBLIC_GUIDE_FULL_YT", undefined);
    vi.stubEnv("NEXT_PUBLIC_GUIDE_SHORT_YT", undefined);
    expect(guides().map((guide) => guide.youtube)).toEqual(["_MUhXil1lek", "dEGY0PMMO7M"]);
    expect(guideIsPublished()).toBe(true);
  });

  it("allows an explicit empty override and never falls back to an MP4", () => {
    vi.stubEnv("NEXT_PUBLIC_GUIDE_FULL_YT", "");
    vi.stubEnv("NEXT_PUBLIC_GUIDE_SHORT_YT", "");
    vi.stubEnv("NEXT_PUBLIC_GUIDE_FULL_URL", "https://example.com/film.mp4");
    expect(guideIsPublished()).toBe(false);
    expect(guides().every((guide) => !("video" in guide))).toBe(true);
  });

  it("rejects lookalike hosts and accepts Shorts", () => {
    expect(youtubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://example.com/?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("javascript:alert(1)")).toBeNull();
    expect(youtubeId("https://youtube.com/shorts/dEGY0PMMO7M")).toBe("dEGY0PMMO7M");
  });

  it("keeps the exact 16 + 7 chapter boundaries from the approved material", () => {
    expect(all.map((guide) => guide.chapters.length)).toEqual([16, 7]);
    for (const guide of all) {
      const source = JSON.parse(readFileSync(`public${guide.chapterFile}`, "utf8"));
      expect(guide.seconds).toBe(source.duration);
      expect(guide.chapters.map(({ title, start, end }) => ({ title, start, end }))).toEqual(source.chapters);
      for (let index = 0; index < guide.chapters.length; index++) {
        const chapter = guide.chapters[index];
        expect(currentChapter(guide.chapters, chapter.start)?.slug).toBe(chapter.slug);
        if (index) expect(currentChapter(guide.chapters, chapter.start - .001)?.slug).toBe(guide.chapters[index - 1].slug);
      }
    }
  });

  it("finds common names for the topics without changing chapter numbers", () => {
    for (const query of ["mail", "pagamento", "notifiche", "Google", "calendario", "abbonamento"]) {
      expect(matchingChapters(all[0].chapters, query).length, query).toBeGreaterThan(0);
    }
    expect(matchingChapters(all[0].chapters, "EMAIL")[0].index).toBe(10);
    expect(matchingChapters(all[0].chapters, "nessun-risultato")).toEqual([]);
    expect(matchingChapters(all[0].chapters, "  ")).toHaveLength(16);
  });

  it("provides a safe external fallback at the selected time", () => {
    expect(youtubeWatchUrl({ ...all[0], youtube: "_MUhXil1lek" }, 416.346)).toBe("https://www.youtube.com/watch?v=_MUhXil1lek&t=416s");
    expect(youtubeWatchUrl({ ...all[0], youtube: null })).toBeNull();
    expect(youtubeWatchUrl(all[0], Infinity)).toMatch(/t=0s$/);
  });

  it("ships public subtitle and index files, not video files", () => {
    for (const guide of all) {
      for (const path of [guide.captions, guide.subtitles, guide.chapterFile]) {
        expect(path).toMatch(/^\/marketing\/guide\//);
        expect(readFileSync(`public${path}`, "utf8").length).toBeGreaterThan(100);
      }
      expect(readFileSync(`public${guide.captions}`, "utf8")).toMatch(/^WEBVTT/);
    }
    expect(readFileSync("src/proxy.ts", "utf8")).toContain('path.startsWith("/marketing/")');
  });

  it("writes the clock the way people read it", () => {
    expect(clock(693)).toBe("11:33");
    expect(clock(0)).toBe("0:00");
    expect(clock(-4)).toBe("0:00");
    expect(clock(416.99)).toBe("6:56");
    expect(clock(Infinity)).toBe("0:00");
    expect(clock(NaN)).toBe("0:00");
  });
});

/**
 * A public page has to be declared public in four separate places, and this
 * codebase has already shipped a page that was reachable but invisible, and
 * one that was advertised but gated. The lists agree here or they do not agree
 * anywhere.
 */
describe("/guida is public in every list that decides it", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("is not gated by the splash, the proxy or the robots file", () => {
    expect(read("src/lib/public-pages.ts")).toContain('"/guida"');
    expect(read("src/proxy.ts")).toContain('path === "/guida"');
    expect(read("src/proxy.ts")).toContain('"/guida",'); // indicizzabile
    expect(read("src/app/sitemap.ts")).toContain("/guida");
    expect(read("src/app/robots.ts")).not.toContain('"/guida"');
  });

  it("is reachable from the public footer", () => {
    expect(read("src/components/SiteFooter.tsx")).toContain('href="/guida"');
  });
});
