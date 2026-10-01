import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAM_VOICE, delivery, isLegacyTts, ttsRequest } from "@/lib/tts-request";

const base = { voice: SAM_VOICE, text: "Could we move the call to Tuesday? (possiamo spostare?)" };

describe("ttsRequest", () => {
  it("never sends delivery notes to tts-1, which rejects them", () => {
    for (const model of ["tts-1", "tts-1-hd"]) {
      const body = ttsRequest({ ...base, model, rate: 0.7 });
      expect(isLegacyTts(model), model).toBe(true);
      expect(body, model).not.toHaveProperty("instructions");
      // On the old model the speed dial is the only way to slow down.
      expect(body.speed, model).toBe(0.7);
    }
  });

  it("tells the new model how to read, and stops stretching the audio", () => {
    const body = ttsRequest({ ...base, model: "gpt-4o-mini-tts", rate: 0.7 });
    expect(body.instructions).toContain("every syllable articulated");
    expect(body.speed).toBe(0.9);
  });

  it("keeps normal speed normal", () => {
    const body = ttsRequest({ ...base, model: "gpt-4o-mini-tts", rate: 1 });
    expect(body.instructions).toContain("natural conversational pace");
    expect(body.speed).toBe(1);
  });

  it("honours the accent the caller asked for", () => {
    expect(delivery(false, "en-GB")).toContain("British English");
    expect(delivery(false, "en-US")).toContain("American English");
    // The listen buttons default to American when they say nothing.
    expect(ttsRequest({ ...base, model: "gpt-4o-mini-tts" }).instructions).toContain("American English");
  });

  it("speaks with the same voice as the realtime call, so Sam is one person", () => {
    expect(SAM_VOICE).toBe("cedar");
  });

  it("drops the Italian gloss, which is for the eye and not the ear", () => {
    expect(ttsRequest({ ...base, model: "gpt-4o-mini-tts" }).input).not.toContain("possiamo");
  });

  it("consegna audio senza perdita, anche al modello vecchio", () => {
    // Quello che una compressione con perdita butta via per primo sono le alte
    // frequenze, cioè le consonanti: "think" contro "sink", le esse finali.
    // Su un'app dove questo audio è il modello che qualcuno ripete ad alta
    // voce, quella è la lezione, non un dettaglio di fedeltà.
    for (const model of ["gpt-4o-mini-tts", "tts-1"]) {
      expect(ttsRequest({ ...base, model }).response_format, model).toBe("wav");
    }
    // E la rotta deve dichiarare lo stesso tipo che chiede, altrimenti il
    // browser riceve wav etichettato come mp3.
    const route = readFileSync("src/app/api/tts/route.ts", "utf8");
    expect(route).toContain('"Content-Type": "audio/wav"');
  });
});
