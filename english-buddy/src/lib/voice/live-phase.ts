import type { VoiceEngine } from "./engines";

/**
 * What the screen says, when the transport stops telling you.
 *
 * The turn-based API announces every boundary: speech started, speech
 * stopped, response created, response done. GPT-Live announces none of them —
 * and not by omission. It is full-duplex, so there are no turns to announce:
 * "Transcript deltas have no item ID or authoritative turn-completed event."
 *
 * So the four words the screen shows — ti ascolto, sto pensando, sto parlando,
 * a te — have to be inferred from the only two things that do arrive: audio
 * deltas going out, and transcript deltas coming in. This is that inference,
 * kept as a pure function precisely because it is the fragile part: the voice
 * screen has shown a wrong state twice, and both times no test could have
 * caught it.
 */
export type Phase = "hearing" | "thinking" | "speaking" | "waiting";

/** Silence after the last outgoing audio before Sam is taken to have finished. */
export const SPEECH_GAP_MS = 900;
/** Silence after the learner's last word before we call it thinking. */
export const LISTEN_GAP_MS = 700;
/** Nothing at all for this long and the turn is simply free again. */
export const IDLE_GAP_MS = 6000;

export type LiveSignal = "user_audio" | "sam_audio" | "none";

/** Which of the two streams an event belongs to, or neither. */
export function signalOf(type: string): LiveSignal {
  if (type === "session.output_audio.delta" || type === "session.output_transcript.delta") return "sam_audio";
  if (type === "session.input_transcript.delta") return "user_audio";
  return "none";
}

export type LiveState = {
  phase: Phase;
  /** When each stream was last heard from, in milliseconds. */
  lastUser: number;
  lastSam: number;
};

/**
 * Never heard from, not heard from at time zero.
 *
 * Written as 0, the start of a call read as "Sam spoke a moment ago", so a
 * learner who opened their mouth first was told the coach was speaking.
 */
export const NEVER = Number.NEGATIVE_INFINITY;

export const INITIAL: LiveState = { phase: "waiting", lastUser: NEVER, lastSam: NEVER };

/**
 * Folds one event into the state. Sam speaking always wins the label: if audio
 * is going out, "sto parlando" is true whatever else is happening — which is
 * the one thing full duplex makes possible and the reason the old labels
 * cannot simply be reused.
 */
export function onEvent(state: LiveState, type: string, now: number): LiveState {
  const signal = signalOf(type);
  if (signal === "sam_audio") return { phase: "speaking", lastUser: state.lastUser, lastSam: now };
  if (signal === "user_audio") {
    // While Sam is still talking the learner's voice does not take the label:
    // both are true at once, and the useful one to show is that Sam is audible.
    const samStillTalking = now - state.lastSam < SPEECH_GAP_MS;
    return { phase: samStillTalking ? "speaking" : "hearing", lastUser: now, lastSam: state.lastSam };
  }
  return state;
}

/**
 * Folds the passage of time. Called on a tick, because the end of a turn is
 * marked by nothing arriving — there is no event for it.
 */
export function onTick(state: LiveState, now: number): LiveState {
  const sinceSam = now - state.lastSam;
  const sinceUser = now - state.lastUser;

  if (state.phase === "speaking" && sinceSam >= SPEECH_GAP_MS) {
    // Sam stopped. If the learner was the last to speak we are waiting on
    // them; otherwise the turn is theirs to take.
    return { ...state, phase: "waiting" };
  }
  if (state.phase === "hearing" && sinceUser >= LISTEN_GAP_MS) {
    return { ...state, phase: "thinking" };
  }
  if (state.phase === "thinking" && sinceUser >= IDLE_GAP_MS && sinceSam >= IDLE_GAP_MS) {
    // A promise that the far end will answer is not one this app can keep.
    return { ...state, phase: "waiting" };
  }
  return state;
}

/** Only these two engines exist; this is here so the switch cannot drift. */
export function usesInferredPhase(engine: VoiceEngine): boolean {
  return engine === "live";
}
