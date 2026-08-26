import { afterEach, describe, expect, it } from "vitest";
import { MODELS, modelFor, modelStatus } from "@/lib/ai/models";

const VARS = ["OPENAI_MODEL", "VOICE_MODEL", "VOICE_TRANSCRIBE_MODEL", "OPENAI_TTS_MODEL"] as const;
afterEach(() => {
  for (const v of VARS) delete process.env[v];
});

/**
 * The point of this table is to be believed. If it ever reported the code's
 * intention instead of what is actually serving, it would be worse than not
 * existing: it would end the very investigation it is meant to start.
 */
describe("modelStatus", () => {
  it("reports the code defaults when nothing overrides them", () => {
    for (const row of modelStatus()) {
      expect(row.inUse, row.slot).toBe(MODELS[row.slot].best);
      expect(row.overridden, row.slot).toBe(false);
    }
  });

  it("reports the environment value, and flags it, when one is set", () => {
    process.env.VOICE_MODEL = "gpt-realtime-2.1-mini";
    const voice = modelStatus().find((m) => m.slot === "voice");
    expect(voice?.inUse).toBe("gpt-realtime-2.1-mini");
    expect(voice?.overridden).toBe(true);
    // The other three must not be dragged along by their neighbour.
    expect(modelStatus().filter((m) => m.overridden)).toHaveLength(1);
  });

  it("does not flag an override that happens to match the intended model", () => {
    process.env.OPENAI_TTS_MODEL = MODELS.speech.best;
    expect(modelStatus().find((m) => m.slot === "speech")?.overridden).toBe(false);
  });

  it("treats an empty or blank variable as absent, not as a model named nothing", () => {
    process.env.OPENAI_MODEL = "   ";
    expect(modelFor("text")).toBe(MODELS.text.best);
    process.env.OPENAI_MODEL = "";
    expect(modelFor("text")).toBe(MODELS.text.best);
  });

  it("trims a pasted value, because dashboards keep the trailing space", () => {
    process.env.VOICE_TRANSCRIBE_MODEL = " gpt-live-transcribe ";
    expect(modelFor("transcribe")).toBe("gpt-live-transcribe");
  });

  it("covers every slot the app can call", () => {
    expect(modelStatus().map((m) => m.slot).sort()).toEqual(["speech", "text", "transcribe", "voice"]);
  });
});
