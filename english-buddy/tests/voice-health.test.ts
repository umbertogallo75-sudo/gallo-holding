import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_CALLS, MIN_SPOKEN_SHARE, voiceVerdict } from "@/lib/voice/health";

/**
 * L'allarme che il 26 ottobre non c'era.
 *
 * Quel giorno la voce era morta e ogni pagina rispondeva benissimo: la
 * schermata della chiamata si apriva, il cronometro partiva, la spia del
 * microfono si accendeva. Il guasto stava dentro una sessione WebRTC fra il
 * browser e OpenAI, dove il nostro server non passa nemmeno, e l'ha trovato
 * una persona per caso.
 *
 * Il server però sa due cose, e la distanza fra le due è tutto il segnale:
 * quante chiamate ha autorizzato, e quante sono diventate una conversazione
 * scritta da qualche parte. Una chiamata che si collega scrive sempre
 * qualcosa — si trascrivono tutti e due i lati, e nessuno apre il microfono
 * per tacere.
 */
describe("la voce muta si vede dal numero di chiamate che non diventano niente", () => {
  it("una notte tranquilla non è un guasto", () => {
    // Una persona apre la pagina, nega il microfono e chiude: su un campione
    // di uno, il silenzio non significa niente.
    expect(voiceVerdict(1, 0)).toMatchObject({ ok: true, reason: "quiet" });
    expect(voiceVerdict(MIN_CALLS - 1, 0)).toMatchObject({ ok: true, reason: "quiet" });
  });

  it("il guasto del 26 ottobre suona", () => {
    // Tutte le chiamate si aprivano, nessuna diceva una parola.
    expect(voiceVerdict(20, 0)).toMatchObject({ ok: false, reason: "silent-calls" });
    expect(voiceVerdict(MIN_CALLS, 0).ok).toBe(false);
  });

  it("una giornata normale non suona", () => {
    expect(voiceVerdict(20, 18)).toMatchObject({ ok: true, reason: "ok" });
    // Qualche microfono negato e qualche ripensamento restano normali.
    expect(voiceVerdict(20, 9).ok).toBe(true);
  });

  it("la soglia è dove si legge perché esiste", () => {
    const opened = 100;
    expect(voiceVerdict(opened, Math.ceil(opened * MIN_SPOKEN_SHARE)).ok).toBe(true);
    expect(voiceVerdict(opened, Math.floor(opened * MIN_SPOKEN_SHARE) - 1).ok).toBe(false);
  });
});

describe("il verdetto pubblico non porta numeri", () => {
  const route = readFileSync("src/app/api/health/voice/route.ts", "utf8");

  it("risponde solo con ok e il motivo", () => {
    // L'indirizzo è aperto perché il controllo del mattino lo legga senza
    // credenziali: per questo non può dire quante chiamate, né di chi.
    expect(route).toContain("{ ok: health.ok, reason: health.reason }");
    expect(route, "non deve uscire un conteggio").not.toMatch(/health\.(opened|spoke)/);
  });

  it("non viene servito da una cache", () => {
    // Un verdetto di ieri è peggio di nessun verdetto.
    expect(route).toContain('"no-store"');
  });
});

describe("il denominatore viene dal server, non dalla pagina", () => {
  const session = readFileSync("src/app/api/voice/session/route.ts", "utf8");

  it("ogni credenziale rilasciata viene contata", () => {
    // Una pagina che non riesce a tenere una conversazione spesso non riesce
    // nemmeno a raccontarlo.
    expect(session).toContain('trackEvent("voice_call_opened"');
    expect(session).toContain("countCall(userId, \"realtime\")");
    expect(session).toContain("countCall(userId, \"live\")");
  });

  it("contare non può far fallire una chiamata", () => {
    expect(session).toMatch(/trackEvent\("voice_call_opened"[\s\S]{0,120}catch\(\(\) => null\)/);
  });
});

describe("il controllo del mattino ci arriva", () => {
  it("l'indirizzo resta fuori dal login", () => {
    // Protetto, risponderebbe 307 verso la pagina di accesso: non un "no",
    // non un "sì", e un controllo che non sa leggerlo smette di controllare.
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('path === "/api/health/voice"');
  });
});
