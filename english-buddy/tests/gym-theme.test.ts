import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The bug this exists to stop.
 *
 * The gym's colours are custom properties declared on one wrapper class, and
 * for a while that class was on no element at all: the tokens were written,
 * every rule referred to them, and none of them resolved. Panes had no
 * background and text took whatever it inherited — which read as "some of the
 * exercises are hard to see in dark mode".
 *
 * The second half of the bug was the dark theme itself. The app has three
 * states, not two: follow the phone, and an explicit choice stamped as
 * data-theme on the document element. The gym declared only the first, and
 * scoped it to its own wrapper, which never carries that attribute — so an
 * explicit dark choice on a light phone got the light palette.
 */
const DIR = join(__dirname, "..", "src", "app", "palestra");
const sheets = readdirSync(DIR).filter((name) => name.endsWith(".module.css"));
const css = Object.fromEntries(sheets.map((name) => [name, readFileSync(join(DIR, name), "utf8")]));
const all = Object.values(css).join("\n");

function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--[gw]-[a-z-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

describe("the gym's palette", () => {
  it("is actually worn: the token wrapper is applied to the whole section", () => {
    const layout = readFileSync(join(DIR, "layout.tsx"), "utf8");
    expect(layout).toContain("styles.root");
  });

  it("defines every token any rule asks for", () => {
    const used = new Set([...all.matchAll(/var\((--[gw]-[a-z-]+)/g)].map((m) => m[1]));
    const defined = new Set([...all.matchAll(/^\s*(--[gw]-[a-z-]+)\s*:/gm)].map((m) => m[1]));
    const missing = [...used].filter((token) => !defined.has(token)).sort();
    expect(missing, `token usati ma mai definiti: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares dark for both of the states the app can be in", () => {
    for (const [name, sheet] of Object.entries(css)) {
      if (!sheet.includes("prefers-color-scheme: dark")) continue;
      // Reaching up to the document element, not to the gym's own wrapper.
      expect(sheet, `${name}: la media query non risale a html`).toMatch(
        /@media \(prefers-color-scheme: dark\)[\s\S]{0,400}:global\(html\):not\(\[data-theme="light"\]\)/
      );
      expect(sheet, `${name}: manca il blocco per la scelta esplicita`).toContain(':global(html)[data-theme="dark"]');
    }
  });

  it("keeps the two dark blocks saying the same thing", () => {
    for (const [name, sheet] of Object.entries(css)) {
      const media = sheet.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/);
      const explicit = sheet.match(/:global\(html\)\[data-theme="dark"\][\s\S]*/);
      if (!media || !explicit) continue;
      const fromMedia = tokensIn(media[1]);
      const fromAttribute = tokensIn(explicit[0]);
      expect(Object.keys(fromMedia).length, `${name}: la media query non dichiara token`).toBeGreaterThan(0);
      expect(fromAttribute, `${name}: i due blocchi scuri sono diversi`).toEqual(fromMedia);
    }
  });

  it("never gives a colour its only definition inside a dark block", () => {
    // A token that exists only in dark leaves the light theme with nothing.
    // Sheet by sheet: concatenating them puts one file's light rules after
    // another file's dark block, which is not what "only in dark" means.
    for (const [name, sheet] of Object.entries(css)) {
      const cut = sheet.indexOf("@media (prefers-color-scheme: dark)");
      if (cut < 0) continue;
      const light = tokensIn(sheet.slice(0, cut));
      const dark = tokensIn(sheet.slice(cut));
      const onlyDark = Object.keys(dark).filter((token) => !(token in light)).sort();
      expect(onlyDark, `${name}: definiti solo al buio: ${onlyDark.join(", ")}`).toEqual([]);
    }
  });
});
