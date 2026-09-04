import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODY_RETENTION_DAYS } from "@/lib/mail/store";

const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");

/**
 * A forwarded work email is the one place in this product where we hold data
 * about people who never agreed to anything — the person who wrote it, whoever
 * is in copy. That has to be declared, and the declaration has to keep saying
 * the same number as the code that does the deleting.
 */
describe("l'informativa sulle mail inoltrate", () => {
  it("declares the retention the code actually applies", () => {
    expect(privacy).toContain(`<strong>${BODY_RETENTION_DAYS} giorni</strong>`);
  });

  it("says plainly that we cannot read their mailbox", () => {
    expect(privacy).toContain("non leggiamo la tua casella di posta");
    expect(privacy).toContain("facoltativa e sempre spenta finché non la usi");
  });

  it("names the third parties in somebody else's email", () => {
    expect(privacy).toContain("dati di altre persone");
    expect(privacy).toContain("segreto professionale");
  });

  it("promises the thing people actually worry about", () => {
    expect(privacy).toContain("Non usiamo queste mail per addestrare modelli");
  });

  it("says how to switch it off", () => {
    expect(privacy).toContain("Come si spegne");
  });
});
