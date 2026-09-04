import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_RAIL } from "@/components/ModeGrid";

const grid = readFileSync("src/components/ModeGrid.tsx", "utf8");
const nav = readFileSync("src/components/BottomNav.tsx", "utf8");
const home = readFileSync("src/app/home/page.tsx", "utf8");

/**
 * The catalogue was invisible: sixteen activities behind a dashed grey line at
 * the foot of the home screen, which not one interviewed tester had noticed.
 * It is now in two places — four cards on the home and a tab in the bar — and
 * two places is exactly how a menu starts pointing at things that no longer
 * exist.
 */
describe("the way into the activity catalogue", () => {
  it("shows on the home only activities the catalogue really has", () => {
    for (const card of HOME_RAIL) {
      expect(grid, `"${card.title}" è sulla home ma non è più tra gli allenamenti`).toContain(`"${card.href}"`);
    }
  });

  it("keeps the rail short enough to be a taste rather than the menu", () => {
    expect(HOME_RAIL.length).toBeGreaterThanOrEqual(3);
    expect(HOME_RAIL.length).toBeLessThanOrEqual(5);
  });

  it("carries the catalogue in the tab bar, where people actually look", () => {
    expect(nav).toContain('href="/allenamenti"');
    expect(nav).toContain('label="Allenamenti"');
  });

  /**
   * The home screen is asked one question — what should I do now? — and the
   * calendar is not an answer to it. It stays reachable, at the foot of the
   * page and at the end of the catalogue, but the three shortcuts at the top
   * are for practising.
   */
  it("does not offer the diary as one of the three shortcuts", () => {
    const shortcuts = home.slice(home.indexOf('className="shortcuts"'), home.indexOf("sectionHead"));
    expect(shortcuts).not.toContain('href="/prepara"');
    expect(shortcuts).toContain('href="/buddy?mode=guided"');
  });

  it("keeps the diary at the foot of the home and of the catalogue", () => {
    expect(home).toContain('href="/prepara"');
    expect(home.indexOf('href="/prepara"')).toBeGreaterThan(home.indexOf("trainRail"));
    expect(grid.indexOf('href="/prepara"')).toBeGreaterThan(grid.indexOf('href="/documenti"'));
  });

  it("no longer hides it behind the dashed line that nobody saw", () => {
    expect(home).not.toContain("allTrainings");
    expect(readFileSync("src/app/globals.css", "utf8")).not.toContain(".allTrainings");
  });
});
