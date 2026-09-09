/**
 * The sound of a run, synthesised rather than downloaded.
 *
 * Every noise here is made with oscillators at play time: no audio files, so
 * nothing to load, nothing to cache, nothing that can be blocked by the
 * content policy, and the tick can change pitch and speed continuously as the
 * clock accelerates — which a recorded loop cannot do.
 *
 * The browser will not let a page make noise before the person has touched it,
 * so the context is created on the first tap and never before.
 */

type Kit = { ctx: AudioContext; master: GainNode };

let kit: Kit | null = null;
let muted = false;

const MUTE_KEY = "execlingo:games:muted";

export function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Private browsing: the choice lasts for this run only.
  }
  if (kit) kit.master.gain.value = value ? 0 : 1;
}

/** Called from the first tap, where the browser allows audio to begin. */
export function armSound(): void {
  if (kit || typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    kit = { ctx, master };
  } catch {
    // No audio available: the game is perfectly playable in silence.
  }
}

export function releaseSound(): void {
  if (!kit) return;
  try {
    void kit.ctx.close();
  } catch {
    /* already gone */
  }
  kit = null;
}

/** One short shaped tone. Everything else here is built from this. */
function blip(freq: number, seconds: number, type: OscillatorType, gain: number, glideTo?: number): void {
  if (!kit || muted) return;
  const { ctx, master } = kit;
  if (ctx.state === "suspended") void ctx.resume();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const t = ctx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, glideTo), t + seconds);
  // A tone that starts and stops on a hard edge clicks; ramps avoid it.
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(env);
  env.connect(master);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

/**
 * The clock. `urgency` runs 0 → 1 as the run gets tighter: the tick climbs in
 * pitch and hardens from a soft pulse into a dry knock, which is what makes it
 * press on you without anything getting louder.
 */
export function tick(urgency: number): void {
  const u = Math.min(Math.max(urgency, 0), 1);
  blip(340 + u * 420, 0.045 + (1 - u) * 0.03, u > 0.55 ? "square" : "sine", 0.055 + u * 0.1);
}

export function letterTap(index: number): void {
  // Rising through a chord as the word fills, so four taps sound like progress.
  blip([523, 659, 784, 988][index % 4], 0.09, "sine", 0.09);
}

export function correct(): void {
  blip(660, 0.1, "sine", 0.14);
  window.setTimeout(() => blip(880, 0.14, "sine", 0.13), 70);
  window.setTimeout(() => blip(1175, 0.22, "sine", 0.11), 150);
}

export function wrong(): void {
  blip(190, 0.22, "sawtooth", 0.1, 120);
}

export function timeUp(): void {
  blip(300, 0.5, "sawtooth", 0.13, 90);
  window.setTimeout(() => blip(180, 0.7, "sine", 0.11, 70), 120);
}

export function bonus(): void {
  blip(1320, 0.16, "triangle", 0.09);
}
