import { readdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The bug this exists to stop, because it cost an afternoon.
 *
 * proxy.ts answers any path it does not recognise with a real 404, so that an
 * invented URL cannot pose as a login page. A new signed-in section that
 * nobody adds to PROTECTED_PAGE_PREFIXES therefore looks, to anyone not
 * logged in, exactly like a route that was never deployed — including to
 * whoever is checking whether the deploy landed.
 *
 * Every top-level page directory that requires a session has to be in that
 * list. This test reads both and says which one is missing.
 */
const proxySource = readFileSync("src/proxy.ts", "utf8");
const prefixes = new Set(
  [...(proxySource.match(/PROTECTED_PAGE_PREFIXES = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1])
);

/** Top-level app directories whose page.tsx demands a signed-in user. */
function guardedSections(): string[] {
  const out: string[] = [];
  for (const name of readdirSync("src/app")) {
    if (name.startsWith("_") || name.startsWith("[") || name === "api") continue;
    const dir = join("src/app", name);
    if (!statSync(dir).isDirectory()) continue;
    const page = join(dir, "page.tsx");
    try {
      if (/requireUserId\s*\(/.test(readFileSync(page, "utf8"))) out.push(`/${name}`);
    } catch {
      // No page.tsx at this level: a section of nested routes only.
    }
  }
  return out;
}

describe("signed-in sections are known to the proxy", () => {
  it("every page that requires a session is listed in PROTECTED_PAGE_PREFIXES", () => {
    const missing = guardedSections().filter((section) => !prefixes.has(section)).sort();
    expect(
      missing,
      `queste sezioni rispondono 404 invece di mandare al login: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("finds the sections at all, so the test cannot pass by reading nothing", () => {
    expect(guardedSections().length).toBeGreaterThan(5);
    expect(guardedSections()).toContain("/home");
  });
});
