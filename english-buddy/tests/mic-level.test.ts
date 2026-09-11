import { describe, expect, it } from "vitest";
import { FLOOR, GAIN, levelFromStats, SMOOTHING, smoothLevel } from "@/lib/voice/mic-level";

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
