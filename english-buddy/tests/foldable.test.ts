import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Un telefono che cambia forma mentre lo usi.
 *
 * L'iPhone Duo si apre da 5,4" a 7,6" e può stare affiancato a un'altra app,
 * quindi la finestra cambia dimensione nel mezzo di una conversazione. Non è
 * un caso nuovo: è lo stesso del tastierino che sale, della rotazione e del
 * divisorio trascinato. È solo la prima volta che succede a metà frase, con
 * continuità, e su un dispositivo che qualcuno userà per parlare inglese.
 *
 * Questi controlli guardano il codice e non il rendering, quindi provano che
 * la regola c'è, non che lo schermo è bello. La prova visiva resta da fare sul
 * simulatore.
 */
const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

describe("la finestra che cambia dimensione mentre parli", () => {
  it("riaggancia la chat al fondo, non solo quando arriva un messaggio", () => {
    // L'effetto che segue la conversazione dipende dai messaggi: una finestra
    // che cambia altezza senza che arrivi niente lasciava l'ultima battuta
    // fuori campo, ed è esattamente quello che fa un telefono che si apre.
    expect(chat).toContain('window.addEventListener("resize", settle)');
    // visualViewport è quello che riporta il tastierino; window.resize è
    // quello che riporta la piega. Servono entrambi.
    expect(chat).toContain('window.visualViewport?.addEventListener("resize", settle)');
  });

  it("riaggancia anche la trascrizione della chiamata", () => {
    expect(voice).toContain('window.addEventListener("resize", settle)');
    expect(voice).toContain('window.visualViewport?.addEventListener("resize", settle)');
  });

  it("smonta i due ascoltatori, perché una chiamata non dura per sempre", () => {
    for (const [name, source] of [["chat", chat], ["voce", voice]] as const) {
      expect(source, name).toContain('window.removeEventListener("resize", settle)');
      expect(source, name).toContain('window.visualViewport?.removeEventListener("resize", settle)');
    }
  });
});

describe("una colonna stretta", () => {
  it("piega la riga di scrittura invece di strozzare la casella di testo", () => {
    // Tre controlli in fila dentro trecento punti: la casella si riduce a una
    // fessura mentre microfono e invio restano larghi come prima.
    expect(css).toContain("@media (max-width: 360px)");
    const narrow = css.slice(css.indexOf("@media (max-width: 360px)"));
    expect(narrow).toContain("flex:1 0 100%");
  });

  it("tiene il margine stretto dove lo spazio è poco", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 360px)"));
    expect(narrow).toContain(".shell { padding-left:12px");
  });
});
