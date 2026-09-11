import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two rules about the admin's dangerous buttons, held together.
 *
 * The first: nothing here calls window.confirm. It halts the main thread, so
 * the whole span from the click to the answer counts as one blocked
 * interaction — which is what put a 1.45-second warning on a button that does
 * nothing slow. It is also the weaker guard, because a native dialog looks
 * identical whatever it is about, and the second "are you sure?" of a two-step
 * delete reads exactly like the first.
 *
 * The second matters more, and is the one this change nearly broke: every
 * action that cannot be undone still asks first. Removing a confirmation is a
 * one-line edit that leaves no trace and no error.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const ADMIN = join(__dirname, "..", "src", "app", "admin");
const files = walk(ADMIN).filter((f) => !f.endsWith("ConfirmPill.tsx"));

describe("the admin's dangerous buttons", () => {
  it("never stops the browser to ask", () => {
    const offenders = files.filter((file) => /window\.confirm|\balert\(/.test(readFileSync(file, "utf8")));
    expect(
      offenders.map((f) => f.replace(`${ADMIN}/`, "")),
      "questi bloccano il thread principale per fare una domanda"
    ).toEqual([]);
  });

  it("still asks before everything that cannot be undone", () => {
    // Each of these performs something irreversible: an account erased, emails
    // sent, licences voided, a payout created, a login code invalidated.
    const mustAsk: Record<string, string[]> = {
      "AdminActions.tsx": ["deleteuser", "freeaccess", "resetcode"],
      "AdminUserLookup.tsx": ["Elimina definitivamente"],
      "AdminTools.tsx": ["Annulla licenze di prova"],
      "AdminCampaign.tsx": ["Invia a"],
      "vendite/PartnerAdminActions.tsx": ["Crea pagamento"],
    };
    for (const [name, actions] of Object.entries(mustAsk)) {
      const source = readFileSync(join(ADMIN, name), "utf8");
      expect(source, `${name} non chiede più conferma`).toContain("ConfirmPill");
      for (const action of actions) {
        expect(source, `${name}: ${action} non è più coperto`).toContain(action);
      }
    }
  });

  it("says what is about to happen, rather than asking twice", () => {
    const pill = readFileSync(join(ADMIN, "ConfirmPill.tsx"), "utf8");
    expect(pill).toContain("question");
    expect(pill).toContain("Sì, procedi");
    expect(pill).toContain("Annulla");
    // Irreversible things are marked as such, not merely asked about.
    expect(pill).toContain("danger");
  });
});
