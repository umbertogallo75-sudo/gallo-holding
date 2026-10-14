import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wakeStrategy } from "@/lib/wake-video";

/**
 * Lo schermo che si spegne mentre parli con Sam.
 *
 * "Se non uso l'app mentre sto dialogando con Sam il display non si deve
 * spegnere, altrimenti si blocca e non funziona." Una conversazione a voce è
 * l'unico schermo di questo prodotto che nessuno tocca — è esattamente il
 * punto — quindi il telefono si blocca dopo i suoi trenta secondi e la
 * chiamata muore a metà frase.
 *
 * Il codice per evitarlo c'era ed era curato. Si era rotto da solo: sceglieva
 * fra l'API e il video a seconda che il browser avesse l'API, dando per
 * scontato che il WebView iOS non l'avesse. iOS l'ha aggiunta, e quella
 * premessa ha disattivato il ripiego proprio sul telefono dove serviva.
 *
 * Nessuno di questi controlli può accorgersi che uno schermo si è spento:
 * provano che i due meccanismi non si escludono più a vicenda.
 */
const hook = readFileSync("src/lib/use-wake-lock.ts", "utf8");
const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");

describe("come si tiene acceso lo schermo", () => {
  it("dentro l'app usa tutti e due i modi, non uno a scelta", () => {
    // Se un lucchetto concesso tenga davvero acceso un WKWebView non è una
    // cosa che la pagina possa scoprire: non esiste un evento per "lo schermo
    // si è spento lo stesso".
    expect(wakeStrategy(true, true)).toBe("both");
  });

  it("in un browser normale l'API basta", () => {
    expect(wakeStrategy(true, false)).toBe("api");
  });

  it("senza API resta il video, come prima", () => {
    expect(wakeStrategy(false, false)).toBe("video");
    expect(wakeStrategy(false, true)).toBe("video");
  });
});

describe("quando l'API non mantiene la promessa", () => {
  it("mette su il video se la richiesta fallisce, invece di arrendersi in silenzio", () => {
    // Era un catch muto: il codice aveva deciso che l'API esisteva, quindi il
    // video non era mai partito, e una richiesta fallita lasciava lo schermo
    // libero di spegnersi.
    const failure = hook.slice(hook.indexOf("} catch {"));
    expect(failure).toContain("playVideo()");
  });

  it("mette su il video anche se il sistema si riprende il lucchetto", () => {
    expect(hook).toContain("if (!cancelled) playVideo();");
  });

  it("tratta un'API che risponde senza dare il lucchetto come un rifiuto", () => {
    expect(hook).toContain("if (!sentinel) {");
  });
});

describe("da quando lo schermo va tenuto", () => {
  it("già durante la connessione, non solo a conversazione avviata", () => {
    // Permesso del microfono, token, offerta e risposta: su una rete lenta è
    // abbastanza da arrivare ai soliti quindici secondi di inattività.
    expect(voice).toContain('useWakeLock(status === "live" || status === "connecting")');
  });
});
