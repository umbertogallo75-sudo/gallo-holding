import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The bug this exists to stop, because it has now happened three times.
 *
 * A page gets a new button with a data-track attribute, nobody adds the name
 * to the API's list, and the click is answered with a 400 for months. Nothing
 * breaks visibly — the button still works — so the only symptom is a number
 * that stays at zero and is read as "nobody is interested".
 *
 * Two lists that have to agree, held together by a test rather than by
 * remembering.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = walk("src");
const sent = new Set<string>();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/data-track="([a-z_]+)"/g)) sent.add(m[1]);
  for (const m of text.matchAll(/\btrack\(\s*"([a-z_]+)"/g)) sent.add(m[1]);
}

const route = readFileSync("src/app/api/track/route.ts", "utf8");
const accepted = new Set(
  [...(route.match(/name:\s*z\.enum\(\[([\s\S]*?)\]\)/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
);

const declared = new Set(
  [...readFileSync("src/lib/analytics.ts", "utf8").matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1])
);

describe("funnel events", () => {
  it("every event the browser sends is one the API accepts", () => {
    const rejected = [...sent].filter((name) => !accepted.has(name)).sort();
    expect(rejected, `inviati dal client ma rifiutati con 400: ${rejected.join(", ")}`).toEqual([]);
  });

  it("every event the API accepts is declared in the funnel type", () => {
    const undeclared = [...accepted].filter((name) => !declared.has(name)).sort();
    expect(undeclared, `accettati ma non nel tipo FunnelEvent: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("actually found the attributes, so a broken search cannot pass silently", () => {
    expect(sent.size).toBeGreaterThan(10);
    expect(accepted.size).toBeGreaterThan(10);
  });
});
