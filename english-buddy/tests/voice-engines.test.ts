import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPARISON,
  DEFAULT_ENGINE,
  ENGINE_CARDS,
  isVoiceEngine,
  VOICE_ENGINES,
} from "@/lib/voice/engines";
import {
  IDLE_GAP_MS,
  INITIAL,
  LISTEN_GAP_MS,
  NEVER,
  onEvent,
  onTick,
  signalOf,
  SPEECH_GAP_MS,
  usesInferredPhase,
  type LiveState,
} from "@/lib/voice/live-phase";

describe("the choice offered to the learner", () => {
  it("keeps the engine with the mileage as the default", () => {
    expect(DEFAULT_ENGINE).toBe("realtime");
    expect(isVoiceEngine("realtime")).toBe(true);
    expect(isVoiceEngine("live")).toBe(true);
    expect(isVoiceEngine("gpt-live-1")).toBe(false);
    expect(isVoiceEngine(null)).toBe(false);
  });

  it("describes both engines, and compares them on the same rows", () => {
    for (const engine of VOICE_ENGINES) {
      const card = ENGINE_CARDS[engine];
      expect(card.engine).toBe(engine);
      expect(card.name.trim()).not.toBe("");
      expect(card.summary.trim()).not.toBe("");
    }
    expect(COMPARISON.length).toBeGreaterThanOrEqual(4);
    for (const row of COMPARISON) {
      expect(row.label.trim()).not.toBe("");
      expect(row.realtime.trim()).not.toBe("");
      expect(row.live.trim()).not.toBe("");
    }
  });

  it("tells the learner the new one is new", () => {
    // The row it would be tempting to leave out. A comparison that only lists
    // the advantages is an advertisement, and this one asks them to choose.
    const honesty = COMPARISON.find((row) => /nuova|spigol/i.test(row.live));
    expect(honesty, "manca la riga che dice che il motore nuovo è nuovo").toBeDefined();
  });
});

describe("reading the state of a full-duplex call", () => {
  it("knows which stream an event belongs to, and ignores the rest", () => {
    expect(signalOf("session.output_audio.delta")).toBe("sam_audio");
    expect(signalOf("session.output_transcript.delta")).toBe("sam_audio");
    expect(signalOf("session.input_transcript.delta")).toBe("user_audio");
    // Events that exist but say nothing about who is talking.
    expect(signalOf("session.usage.updated")).toBe("none");
    expect(signalOf("session.started")).toBe("none");
    // And the turn-based names, which never arrive here at all.
    expect(signalOf("response.done")).toBe("none");
    expect(signalOf("input_audio_buffer.speech_started")).toBe("none");
  });

  it("says Sam is speaking the moment his audio arrives", () => {
    const state = onEvent(INITIAL, "session.output_audio.delta", 1000);
    expect(state.phase).toBe("speaking");
    expect(state.lastSam).toBe(1000);
  });

  it("keeps saying Sam is speaking when both talk at once", () => {
    // The thing full duplex makes possible, and the reason the old labels
    // cannot be reused: the learner starting to talk does not end Sam's turn.
    let state = onEvent(INITIAL, "session.output_audio.delta", 1000);
    state = onEvent(state, "session.input_transcript.delta", 1000 + SPEECH_GAP_MS - 50);
    expect(state.phase).toBe("speaking");
    expect(state.lastUser).toBe(1000 + SPEECH_GAP_MS - 50);
  });

  it("hears the learner once Sam has actually stopped", () => {
    let state = onEvent(INITIAL, "session.output_audio.delta", 1000);
    state = onEvent(state, "session.input_transcript.delta", 1000 + SPEECH_GAP_MS + 10);
    expect(state.phase).toBe("hearing");
  });

  it("lets a silence end Sam's turn, because nothing announces it", () => {
    const speaking = onEvent(INITIAL, "session.output_audio.delta", 1000);
    expect(onTick(speaking, 1000 + SPEECH_GAP_MS - 1).phase).toBe("speaking");
    expect(onTick(speaking, 1000 + SPEECH_GAP_MS).phase).toBe("waiting");
  });

  it("waits before calling a pause thinking, so a breath is not a turn", () => {
    const hearing = onEvent(INITIAL, "session.input_transcript.delta", 5000);
    expect(onTick(hearing, 5000 + LISTEN_GAP_MS - 1).phase).toBe("hearing");
    expect(onTick(hearing, 5000 + LISTEN_GAP_MS).phase).toBe("thinking");
  });

  it("never leaves 'sta pensando' on the screen forever", () => {
    // The failure that has actually happened twice: a label that outlives the
    // thing it describes, with nobody coming to correct it.
    let state: LiveState = onEvent(INITIAL, "session.input_transcript.delta", 0);
    state = onTick(state, LISTEN_GAP_MS);
    expect(state.phase).toBe("thinking");
    state = onTick(state, IDLE_GAP_MS + 1);
    expect(state.phase).toBe("waiting");
  });

  it("leaves the label alone for an event it does not recognise", () => {
    const speaking = onEvent(INITIAL, "session.output_audio.delta", 1000);
    expect(onEvent(speaking, "something.new.we.have.not.seen", 1100)).toEqual(speaking);
  });

  it("only infers the phase for the engine that needs it", () => {
    expect(usesInferredPhase("live")).toBe(true);
    expect(usesInferredPhase("realtime")).toBe(false);
  });

  it("uses gaps short enough to feel live and long enough not to flicker", () => {
    expect(LISTEN_GAP_MS).toBeLessThan(SPEECH_GAP_MS);
    expect(SPEECH_GAP_MS).toBeLessThan(IDLE_GAP_MS);
    expect(LISTEN_GAP_MS).toBeGreaterThanOrEqual(400);
  });
});

describe("the start of a call", () => {
  it("does not claim Sam is speaking before he has said anything", () => {
    // The bug this caught: "never heard from" was written as time zero, so at
    // the top of a call a learner who spoke first was told the coach was
    // talking over them.
    const state = onEvent(INITIAL, "session.input_transcript.delta", 0);
    expect(state.phase).toBe("hearing");
    expect(INITIAL.lastSam).toBe(NEVER);
    expect(INITIAL.lastUser).toBe(NEVER);
  });

  it("starts with the turn belonging to nobody in particular", () => {
    expect(INITIAL.phase).toBe("waiting");
    // And a tick on an untouched call must not invent a transition.
    expect(onTick(INITIAL, 10_000)).toEqual(INITIAL);
  });
});

describe("how a call is started", () => {
  it("offers one button per engine, each naming its own mode", () => {
    const source = readFileSync(join(__dirname, "..", "src", "app", "voice", "EnginePicker.tsx"), "utf8");
    // One button per engine, built from the catalogue rather than written out,
    // so a third engine could never be added and quietly not offered.
    expect(source).toContain("VOICE_ENGINES.map");
    expect(source).toContain("Inizia a parlare");
    // The colour carries which is which: green familiar, blue new.
    expect(source).toContain("styles.classic");
    expect(source).toContain("styles.advanced");
  });

  it("colours both buttons in both themes, never only in one", () => {
    // A colour defined only inside a dark block leaves the light theme with
    // nothing — the fault that made half the gym unreadable.
    const css = readFileSync(join(__dirname, "..", "src", "app", "voice", "engine.module.css"), "utf8");
    const cut = css.indexOf("@media (prefers-color-scheme: dark)");
    const light = css.slice(0, cut);
    for (const rule of [".classic", ".advanced", ".headClassic", ".headAdvanced"]) {
      expect(light, `${rule} non ha un colore chiaro`).toContain(rule);
    }
    // And dark is declared for both of the states the app can be in.
    expect(css).toContain(':global(html):not([data-theme="light"])');
    expect(css).toContain(':global(html)[data-theme="dark"]');
  });

  it("still explains the difference, without making it a step", () => {
    const source = readFileSync(join(__dirname, "..", "src", "app", "voice", "EnginePicker.tsx"), "utf8");
    expect(source).toContain("Qual è la differenza?");
    expect(source).toContain("COMPARISON.map");
  });
});

describe("Sam's voice", () => {
  const route = readFileSync(join(__dirname, "..", "src", "app", "api", "voice", "session", "route.ts"), "utf8");

  it("is asked for on both engines, not only on the one that had it", () => {
    // Sam is male everywhere in this app. A female coach in one mode is not a
    // preference, it is a different character — which is exactly what shipped.
    const asks = route.match(/voice: "cedar"/g) ?? [];
    expect(asks.length, "la voce va chiesta su entrambi i motori").toBeGreaterThanOrEqual(2);
  });

  it("retries without the voice rather than losing the call to a rejected field", () => {
    // Where the field lives on an API a week old is not something to be
    // certain about: a wrong guess must cost the voice, never the call.
    expect(route).toContain("response.status === 400");
    expect(route).toContain("open(false)");
  });
});
