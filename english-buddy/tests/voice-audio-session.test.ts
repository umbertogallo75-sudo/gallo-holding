import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const swift = readFileSync("ios/ExecLingo/ExecLingo/ContentView.swift", "utf8");
const session = readFileSync("src/app/api/voice/session/route.ts", "utf8");

/**
 * On speakerphone the coach kept hearing itself and cutting off. The fix was
 * to have the native shell put the phone into a voice-chat audio session, so
 * the hardware echo canceller would run.
 *
 * It ran. It also took the audio session out from under the WebView that was
 * already recording through it: the call reached "live" and went straight to
 * "In pausa" at 0:00 — on headphones too, where there was no echo to cancel.
 *
 * A conversation that will not start is worse than one that echoes, so the
 * shell is not told about calls any more. These tests hold that line: it must
 * not come back without somebody testing it on a real phone first.
 */
describe("the phone's audio session belongs to WebKit", () => {
  it("does not reach for the native audio bridge from the page", () => {
    expect(voice).not.toContain("messageHandlers?.audio");
    expect(voice).not.toContain("tellPhoneAboutCall");
  });

  it("leaves no handler in the shell for it to reach", () => {
    expect(swift).not.toContain('name: "audio"');
    expect(swift).not.toContain("setVoiceCallAudio");
    expect(swift).not.toContain("AVAudioSession");
  });

  it("keeps the one part of the echo fix that never broke anything", () => {
    // The model's own noise handling is server-side and touches no session:
    // a microphone across a room, not held against a mouth.
    expect(session).toContain('noise_reduction: { type: "far_field" }');
    expect(session).not.toContain("near_field");
  });

  it("still stops the clock when something really does take the call away", () => {
    // The pause exists for phone calls and lock screens, and that behaviour is
    // unchanged — it was being triggered by our own doing, not by a caller.
    expect(voice).toContain('setInterrupted("paused")');
    expect(voice).toContain("visibilitychange");
  });
});

/**
 * Il saluto che non arrivava mai, e la riga che lo spegneva.
 *
 * Tutto quello che decide come si comporta una chiamata — il modello, le
 * istruzioni, le lingue della trascrizione e soprattutto `turn_detection`,
 * cioè quello che fa rispondere Sam quando l'altro smette di parlare — sta
 * nella sessione con cui il server conia il client secret. La stretta di
 * mano documentata è l'URL nudo, la chiave effimera e l'SDP: la sessione
 * arriva con la chiave.
 *
 * Rinominare il modello nella query non aggiunge niente che non ci sia già,
 * e il 26 ottobre la chiamata si apriva, portava l'audio e non rispondeva
 * mai: una sessione che non era quella configurata.
 */
describe("la stretta di mano della voce non riconfigura niente", () => {
  it("manda l'SDP all'URL nudo, senza il modello in coda", () => {
    expect(voice).toContain('fetch("https://api.openai.com/v1/realtime/calls"');
    expect(voice, "il modello torna nella query e la sessione si perde").not.toMatch(
      /realtime\/calls\?/,
    );
  });

  it("la sessione resta quella che conia il client secret", () => {
    // Se queste sparissero dalla richiesta del segreto, la chiamata
    // tornerebbe muta per lo stesso motivo, da un'altra parte.
    expect(session).toContain("client_secrets");
    expect(session).toContain("turn_detection");
  });

  it("un rifiuto dice almeno il codice", () => {
    // "Voice connection failed" da solo e quello che si legge quando i log
    // non si possono aprire.
    expect(voice).toContain("Voice connection failed (${answerResponse.status})");
  });
});
