import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTheme, THEMES, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const picker = readFileSync("src/components/ThemePicker.tsx", "utf8");

/** The declarations inside the first block matching a selector. */
function block(selector: string): string[] {
  const at = css.indexOf(selector + " {");
  expect(at, `${selector} non è più nel foglio di stile`).toBeGreaterThan(-1);
  const body = css.slice(at + selector.length + 2, css.indexOf("}", at));
  return body.split(";").map((d) => d.trim()).filter(Boolean).sort();
}

/**
 * The dark palette is written twice on purpose — once for the system
 * preference, once for the explicit choice — because CSS has no way to say it
 * once. Two copies drift; this is what stops them.
 */
describe("chiaro, scuro, o come il telefono", () => {
  it("declares the same dark palette for the system and for the manual choice", () => {
    expect(block(':root[data-theme="dark"]')).toEqual(block(':root:not([data-theme="light"])'));
  });

  it("lets the manual choice win in both directions", () => {
    // Light chosen on a phone set to dark: the dark block must exclude it.
    expect(css).toContain(':root:not([data-theme="light"])');
    // Dark chosen on a phone set to light: an attribute block outside any media query.
    const attr = css.indexOf(':root[data-theme="dark"] {');
    const media = css.lastIndexOf("@media", attr);
    expect(css.slice(media, attr)).toContain("}");
  });

  it("tells the browser which scheme it is showing", () => {
    // Without this the WebView paints its own chrome from the system setting,
    // which is exactly the mismatch the setting exists to fix.
    expect(block(":root")).toContain("color-scheme: light");
    expect(block(':root[data-theme="dark"]')).toContain("color-scheme: dark");
  });

  it("restores the choice before the first paint", () => {
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    expect(head).toContain("THEME_SCRIPT");
    expect(THEME_SCRIPT).toContain(THEME_KEY);
    expect(THEME_SCRIPT).toContain("try");
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("offers exactly the three choices the code knows about", () => {
    expect(THEMES).toEqual(["system", "light", "dark"]);
    for (const theme of THEMES) expect(picker).toContain(`${theme}:`);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
