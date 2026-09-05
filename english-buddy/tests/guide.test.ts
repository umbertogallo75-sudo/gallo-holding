import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clock, guideIsPublished, guides, resolveDeepLink, slugify } from "@/lib/guide";

const all = guides();

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
    expect(wanted.chapter?.start).toBe(380);

    // Nothing here may throw: these values come from a URL somebody typed.
    expect(resolveDeepLink({ v: "../../etc", c: "nope" }, all).guide.key).toBe("manuale");
    expect(resolveDeepLink({}, all).chapter).toBeNull();
    // A chapter belongs to its own guide, never to the other one.
    expect(resolveDeepLink({ v: "sintesi", c: "le-tue-email-di-lavoro" }, all).chapter).toBeNull();
  });

  it("says nothing is published until the addresses are set", () => {
    // The films live in an object store, not in Git, so a checkout has none.
    expect(guideIsPublished()).toBe(Boolean(process.env.NEXT_PUBLIC_GUIDE_FULL_URL));
  });

  it("writes the clock the way people read it", () => {
    expect(clock(693)).toBe("11:33");
    expect(clock(0)).toBe("0:00");
    expect(clock(-4)).toBe("0:00");
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
