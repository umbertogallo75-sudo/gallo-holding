import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * La barra di sistema che sta su un fianco.
 *
 * Sull'iPhone Duo la barra di stato è verticale e occupa una colonna di lato,
 * e lo schermo esterno è pieno fino al bordo. Apple: "vertical bars provide
 * leading and trailing insets", e soprattutto "safe areas are often
 * asymmetric. This is especially true on iPhone Duo... avoid assuming that
 * insets on opposite sides are equal."
 *
 * L'app aveva già viewport-fit=cover, quindi disegnava fino al bordo, ma non
 * usava gli inset laterali da nessuna parte: solo sopra e sotto. Il risultato
 * è contenuto che passa sotto una barra con cui l'utente interagisce.
 *
 * Nessuno di questi controlli può vedere uno schermo. Provano le due regole
 * che il difetto violava: i comandi stanno dentro l'area sicura, e nessuno
 * dà per scontato che i due lati siano uguali.
 */
const css = readFileSync("src/app/globals.css", "utf8");

/** Le regole che stabiliscono il margine laterale di un contenitore. */
const CONTAINERS = [".shell", ".adminShell", ".landShell", ".callBar", ".callBody"];

describe("i comandi stanno dentro l'area sicura", () => {
  it("il guscio dell'app lascia spazio alla barra su entrambi i lati", () => {
    expect(css).toContain("padding-left: max(18px, env(safe-area-inset-left, 0px))");
    expect(css).toContain("padding-right: max(18px, env(safe-area-inset-right, 0px))");
  });

  it("nessuna regola successiva cancella l'inset con un valore secco", () => {
    // Una regola più avanti nel file che riscrive il margine in pixel fissi
    // toglie in silenzio quello che la regola di prima aveva messo. È successo
    // con la colonna stretta dello split view, scritta prima di sapere della
    // barra laterale.
    for (const name of CONTAINERS) {
      const rules = css.split(new RegExp(`\\${name}\\s*\\{`)).slice(1);
      for (const rule of rules) {
        const body = rule.slice(0, rule.indexOf("}"));
        const flat = body.replace(/\s+/g, " ");
        for (const side of ["padding-left", "padding-right"]) {
          const m = new RegExp(`${side}\\s*:\\s*([^;]+)`).exec(flat);
          if (m && !m[1].includes("env(safe-area")) {
            throw new Error(`${name} fissa ${side} a "${m[1].trim()}" senza inset laterale`);
          }
        }
      }
    }
  });
});

/** Le barre fisse in fondo allo schermo. */
const BARS = [".bottomNav", ".composer"];

describe("nessuno assume che i due lati siano uguali", () => {
  it("le barre fisse si centrano nell'area sicura, non nello schermo", () => {
    // left:50% con translateX(-50%) centra sullo schermo: con la barra su un
    // fianco solo, la navigazione e la riga di scrittura ci finiscono sotto.
    for (const name of BARS) {
      const rule = css.slice(css.indexOf(name + " {"));
      const body = rule.slice(0, rule.indexOf("}"));
      expect(body, `${name} si centra ancora sullo schermo`).not.toContain("translateX(-50%)");
      expect(body, `${name} non prende l'inset sinistro`).toMatch(
        /left:calc\(\s*\d+px \+ env\(safe-area-inset-left, 0px\)\s*\)/,
      );
      expect(body, `${name} non prende l'inset destro`).toMatch(
        /right:calc\(\s*\d+px \+ env\(safe-area-inset-right, 0px\)\s*\)/,
      );
      expect(body).toContain("margin-inline:auto");
    }
  });

  it("nessuna barra fissa prende la larghezza da una percentuale", () => {
    // Il difetto che lo screenshot dell'iPhone Duo chiuso ha mostrato: dare
    // left e right corretti non basta se poi la larghezza arriva da una
    // percentuale. In una regola position:fixed quel 100% si calcola
    // sull'intero viewport, non sullo spazio fra i due inset, quindi la barra
    // resta più larga dello spazio libero e sborda sotto la colonna di stato.
    // La larghezza deve restare quella che left e right lasciano: width:auto.
    for (const name of BARS) {
      const rules = css.split(new RegExp(`\\${name}\\s*\\{`)).slice(1);
      for (const rule of rules) {
        const flat = rule.slice(0, rule.indexOf("}")).replace(/\s+/g, " ");
        const m = /(?:^|[;{ ])width\s*:\s*([^;]+)/.exec(flat);
        if (m && m[1].includes("%")) {
          throw new Error(`${name} prende la larghezza da "${m[1].trim()}", non dagli inset`);
        }
      }
    }
  });

  it("gli sfondi a tutto schermo restano a tutto schermo", () => {
    // La regola di Apple ha due metà, e questa è quella che non va persa:
    // "allow background elements such as full-bleed artwork to fill the
    // available space, extending behind toolbars and sidebars."
    for (const veil of [".callLayer", ".tourVeil", ".welcomeOverlay"]) {
      const rule = css.slice(css.indexOf(veil + " {"));
      expect(rule.slice(0, rule.indexOf("}")), veil).toContain("inset:0");
    }
  });
});
