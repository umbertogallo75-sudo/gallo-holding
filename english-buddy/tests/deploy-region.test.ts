import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Where the code runs, next to where the data is.
 *
 * Measured before this was set: a request touching nothing took ~150ms, the
 * same request with one query took ~300. The functions were in Washington and
 * the database in Dublin, so every question crossed the Atlantic and came
 * back — on a product whose users are all in Italy, which meant the ocean was
 * crossed twice more before the page even started.
 *
 * This is one word, it is invisible, and someone tidying this file would
 * remove it without noticing. The whole app doubles in speed on it.
 */
describe("dove gira il codice", () => {
  it("stays in the same city as the database", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { regions?: string[] };
    expect(config.regions, "senza regione, Vercel torna a Washington").toBeDefined();
    expect(config.regions).toEqual(["dub1"]);
  });
});
