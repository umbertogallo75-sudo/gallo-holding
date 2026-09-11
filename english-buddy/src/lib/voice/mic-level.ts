/**
 * How loudly the microphone is actually hearing, for the ring around the orb.
 *
 * Read from the connection's own statistics rather than from a Web Audio
 * analyser, and that choice is deliberate. Building an AudioContext over the
 * microphone is the ordinary way to do this, but on iOS it touches the audio
 * session — and the last time this app touched the audio session for what
 * looked like a safe reason, every call on speakerphone went silent and sat at
 * "In pausa" until it was reverted. The statistics are already being gathered
 * for us, cost nothing, and cannot route anything anywhere.
 *
 * The pure parts live here so the behaviour can be tested: what a report
 * yields, and how a jittery reading becomes a smooth ring.
 */

/** Level as WebRTC reports it: 0 is silence, 1 is full scale. */
export type Level = number;

/** How much of the new reading to take each time. Lower is calmer. */
export const SMOOTHING = 0.35;
/** Below this it is room noise, not somebody talking. */
export const FLOOR = 0.02;
/** Speech rarely fills the scale, so the ring would barely move without this. */
export const GAIN = 3.2;

type StatLike = { type?: string; kind?: string; audioLevel?: number };

/**
 * The outgoing microphone level out of a statistics report.
 *
 * Browsers disagree about where it lives — "media-source" is the current
 * place, "track" the older one — so both are read, and anything else is
 * ignored rather than guessed at.
 */
export function levelFromStats(reports: Iterable<StatLike>): Level | null {
  let found: number | null = null;
  for (const report of reports) {
    if (typeof report.audioLevel !== "number") continue;
    if (report.type === "media-source" && report.kind === "audio") return clamp(report.audioLevel);
    if (report.type === "track" || report.type === "media-source") found = clamp(report.audioLevel);
  }
  return found;
}

function clamp(value: number): Level {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * One reading folded into the ring's size. Silence falls away quickly enough
 * to feel responsive, and speech is amplified because a voice at a metre
 * reports a fraction of full scale and an honest ring would look broken.
 */
export function smoothLevel(previous: Level, reading: Level | null): Level {
  const target = reading === null || reading < FLOOR ? 0 : clamp(reading * GAIN);
  return clamp(previous + (target - previous) * SMOOTHING);
}
