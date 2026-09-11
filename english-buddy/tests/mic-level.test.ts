import { describe, expect, it } from "vitest";
import {
  FLOOR,
  GAIN,
  isAudible,
  levelFromStats,
  levelsFromStats,
  SMOOTHING,
  smoothLevel,
  SPEAKING_AT,
} from "@/lib/voice/mic-level";

describe("reading the microphone level", () => {
  it("prefers the current place browsers put it", () => {
    expect(
      levelFromStats([
        { type: "track", audioLevel: 0.1 },
        { type: "media-source", kind: "audio", audioLevel: 0.4 },
      ])
    ).toBe(0.4);
  });

  it("falls back to the older place rather than giving up", () => {
    expect(levelFromStats([{ type: "track", audioLevel: 0.25 }])).toBe(0.25);
  });

  it("ignores reports that are about something else", () => {
    expect(levelFromStats([{ type: "inbound-rtp", audioLevel: 0.9 }, { type: "candidate-pair" }])).toBeNull();
    expect(levelFromStats([])).toBeNull();
    // A video media-source has no business driving a microphone ring.
    expect(levelFromStats([{ type: "media-source", kind: "video", audioLevel: 0.8 }])).toBe(0.8);
  });

  it("never returns anything outside the scale, whatever it is handed", () => {
    expect(levelFromStats([{ type: "media-source", kind: "audio", audioLevel: 5 }])).toBe(1);
    expect(levelFromStats([{ type: "media-source", kind: "audio", audioLevel: -2 }])).toBe(0);
    expect(levelFromStats([{ type: "media-source", kind: "audio", audioLevel: NaN }])).toBe(0);
  });
});

describe("turning readings into a ring", () => {
  it("grows towards a loud reading and falls back to silence", () => {
    let level = 0;
    for (let i = 0; i < 20; i += 1) level = smoothLevel(level, 0.3);
    expect(level).toBeGreaterThan(0.8);
    for (let i = 0; i < 20; i += 1) level = smoothLevel(level, 0);
    expect(level).toBeLessThan(0.01);
  });

  it("treats room noise as silence", () => {
    expect(smoothLevel(0, FLOOR / 2)).toBe(0);
    expect(smoothLevel(0, null)).toBe(0);
  });

  it("amplifies, because a voice at a metre barely registers", () => {
    expect(GAIN).toBeGreaterThan(1);
    // One step is partial: the ring must not snap.
    expect(smoothLevel(0, 0.3)).toBeLessThan(0.3 * GAIN);
    expect(smoothLevel(0, 0.3)).toBeGreaterThan(0);
  });

  it("never leaves the scale, however long it runs", () => {
    let level = 0;
    for (let i = 0; i < 200; i += 1) level = smoothLevel(level, 1);
    expect(level).toBeLessThanOrEqual(1);
    expect(SMOOTHING).toBeGreaterThan(0);
    expect(SMOOTHING).toBeLessThan(1);
  });
});

describe("hearing both sides of the call", () => {
  it("tells the microphone apart from what is arriving", () => {
    const levels = levelsFromStats([
      { type: "media-source", kind: "audio", audioLevel: 0.2 },
      { type: "inbound-rtp", kind: "audio", audioLevel: 0.6 },
    ]);
    expect(levels.mic).toBe(0.2);
    expect(levels.remote).toBe(0.6);
  });

  it("reads the older shape, where direction is a flag", () => {
    const levels = levelsFromStats([
      { type: "track", audioLevel: 0.15 },
      { type: "track", audioLevel: 0.5, remoteSource: true },
    ]);
    expect(levels.mic).toBe(0.15);
    expect(levels.remote).toBe(0.5);
  });

  it("says nothing rather than guessing when the report has neither", () => {
    expect(levelsFromStats([{ type: "candidate-pair" }])).toEqual({ mic: null, remote: null });
  });

  it("knows a room from a person", () => {
    // The screen has to decide whose turn it is from this alone: the
    // full-duplex engine announces no turn boundaries, and on this transport
    // the data channel may deliver nothing at all.
    expect(isAudible(null)).toBe(false);
    expect(isAudible(0)).toBe(false);
    expect(isAudible(SPEAKING_AT - 0.001)).toBe(false);
    expect(isAudible(SPEAKING_AT)).toBe(true);
    expect(isAudible(0.9)).toBe(true);
  });

  it("calls somebody audible before the ring has finished growing", () => {
    // Otherwise the label would lag a beat behind the sound, which on a call
    // reads as the app being slow rather than careful.
    expect(SPEAKING_AT).toBeGreaterThanOrEqual(FLOOR);
    expect(SPEAKING_AT).toBeLessThan(0.2);
  });
});
