"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/lib/use-wake-lock";
import { track } from "@/lib/track-client";
import { RememberPhrase } from "@/components/RememberPhrase";

type Line = { role: "you" | "coach"; text: string };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

/**
 * Whose turn it is, as far as the far end is concerned.
 *
 * On speakerphone the app is at arm's length and silence is ambiguous: a
 * pause while the model composes an answer is indistinguishable from a
 * crash. People waited, then started talking over it to check it was alive,
 * which produced exactly the mess they were trying to diagnose. Saying which
 * of the four things is happening costs one line and removes the guesswork.
 */
type Phase = "waiting" | "hearing" | "thinking" | "speaking";

const PHASE_LABEL: Record<Phase, string> = {
  waiting: "Tocca a te",
  hearing: "Ti ascolto",
  thinking: "Sam sta pensando",
  speaking: "Sam parla",
};

/** If the far end goes quiet without saying why, stop claiming it is thinking. */
const THINKING_TIMEOUT_MS = 12_000;

/**
 * How long one spoken session lasts, and how it ends.
 *
 * Fifteen minutes of real conversation is a full lesson. What matters more is
 * the last minute: when the cap simply cut the call, the screen said "Ottima
 * sessione" and the person read it as a crash — nothing had announced it and
 * nothing followed it. So the ending is now told in advance, Sam is asked to
 * close the spoken part himself, and the lesson carries on in writing.
 */
const MAX_SECONDS = 900;
const WARNING_SECONDS = MAX_SECONDS - 60;

/**
 * Where the conversation continues once the voice stops.
 *
 * A written mode from the coach's own list, never the voice one: "voice" and
 * "diary" are not activities the chat API knows, and sending one would greet
 * the handoff with an error. "buddy" is the closest thing in writing to what
 * they were just doing — a friend, still talking.
 */
const HANDOFF_HREF = "/buddy?mode=buddy";

/**
 * How long the app waits before deciding an interruption is over for good.
 *
 * A glance at a notification is seconds; a phone call is not. Below this the
 * conversation is picked up where it stopped, above it the call is closed
 * properly rather than left running against a microphone somebody else is
 * using.
 */
const RESUME_GRACE_MS = 45_000;

/**
 * The phone's audio session is WebKit's business, not ours.
 *
 * This used to hand the call to the native shell so it could switch to
 * play-and-record in voice-chat mode and turn on the hardware echo canceller.
 * It did turn it on. It also took the session out from under the WebView that
 * was already recording through it, and the call went to "In pausa" at 0:00 —
 * with headphones too, where there was no echo to cancel in the first place.
 *
 * A conversation that will not start is worse than one that echoes, so the
 * shell is no longer told anything and WebKit keeps the session it manages
 * for getUserMedia. The echo is back, unsolved, and it stays open until
 * somebody can test a fix on a real phone rather than reason about it.
 */

import { DEFAULT_ENGINE, ENGINE_KEY, isVoiceEngine, type VoiceEngine } from "@/lib/voice/engines";
import { INITIAL, onEvent, onTick, type LiveState } from "@/lib/voice/live-phase";
import { isAudible, levelsFromStats, smoothLevel } from "@/lib/voice/mic-level";
import { EngineStart } from "./EnginePicker";

/**
 * The engine this device used last. Only the resume-after-the-limit button
 * needs it: everywhere else the choice arrives with the tap that starts.
 */
function lastEngine(): VoiceEngine {
  try {
    const saved = window.localStorage.getItem(ENGINE_KEY);
    return isVoiceEngine(saved) ? saved : DEFAULT_ENGINE;
  } catch {
    return DEFAULT_ENGINE;
  }
}

/** An id for the row this call writes into, made before the call connects. */
function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Not a secure context, or an old shell: any stable unique string will do,
    // the server only checks that it looks like an id and is not somebody
    // else's.
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export function VoiceClient({ mode, hero, reopen }: { mode?: string; hero?: React.ReactNode; reopen?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const linesRef = useRef<Line[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const [detached, setDetached] = useState(false);
  /** Something took the microphone or the screen: a call, a lock, a swipe. */
  const [interrupted, setInterrupted] = useState<null | "paused" | "lost">(null);
  /** The last minute of voice, and then the cap: both are said out loud. */
  const [nearLimit, setNearLimit] = useState(false);
  const [reachedLimit, setReachedLimit] = useState(false);
  const warnedRef = useRef(false);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which engine this call is running on, and its inferred state if Live. */
  const engineRef = useRef<VoiceEngine>(DEFAULT_ENGINE);
  const liveRef = useRef<LiveState>(INITIAL);
  const liveTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * The orb, written to directly rather than through state: this changes five
   * times a second and a re-render of the whole call screen for a ring is a
   * poor trade.
   */
  const orbRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(0);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Transcript deltas, which is all the Live engine sends: no completed event. */
  const draftRef = useRef<{ you: string; coach: string }>({ you: "", coach: "" });
  /** The sentence being said right now, shown while it is still arriving. */
  const [streaming, setStreaming] = useState<Line | null>(null);
  const liveLineRef = useRef<Line | null>(null);
  const awaySinceRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("idle");
  /**
   * Where this conversation is being written down.
   *
   * The id is made here rather than asked for, so that every flush — including
   * the last one, which leaves on a beacon nobody can acknowledge — names the
   * same row. A retried flush then writes nothing new instead of opening a
   * second conversation.
   */
  const sessionRef = useRef<string>("");
  /** The next line number to hand out; also what makes the writes idempotent. */
  const seqRef = useRef(0);
  /**
   * Which leg of this conversation is being spoken.
   *
   * A call that is picked up numbers its lines from zero again, and without a
   * name of its own the second leg's line 3 would claim the row the first
   * leg's line 3 already has — and the write that protects against retries
   * would quietly throw it away.
   */
  const legRef = useRef("a");
  /** Said, not yet saved. */
  const pendingRef = useRef<{ seq: number; role: "you" | "coach"; text: string }[]>([]);
  const flushingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Who is allowed to be heard, and when.
   *
   * A spoken lesson does not happen in a studio: somebody walks into the room,
   * you answer them, the television is on — and Sam, who cannot tell your
   * colleague from you, takes all of it as English practice and corrects a
   * sentence nobody addressed to him.
   *
   * This was first built as hold-to-talk, and holding the button turned out to
   * be the wrong instrument: a thumb parked on the screen covers the
   * transcript, and the transcript is where you read what Sam just said. So it
   * is one switch instead — closed while you deal with the room, open when you
   * are talking to Sam — and both states are visible without holding anything.
   */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  /** A spoken conversation left unfinished, offered back on the way in. */
  const [resumable, setResumable] = useState<{ id: string; lastAt: string; exchanges: number; preview?: string; continuing?: boolean } | null>(null);
  const [resumedFrom, setResumedFrom] = useState(0);
  const lookedRef = useRef(false);

  // Teardown on unmount, and only on unmount: listing cleanup as a dependency
  // would re-run it on every render, which would hang up the call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { cleanup(false); }, []);

  // A spoken conversation is the one screen nobody touches, so the phone locks
  // and the call dies mid-sentence. Held only while the call is live.
  useWakeLock(status === "live");

  /**
   * What happens when a phone call arrives in the middle of a conversation.
   *
   * The system takes the microphone and puts the page in the background. From
   * inside the app nothing announced this: Sam kept talking to an empty room,
   * the timer kept crediting minutes nobody practised, and the person came
   * back to a screen still claiming to be in conversation.
   *
   * Leaving the page is treated as the same event, because from here it is
   * indistinguishable and the right answer is the same either way: stop the
   * clock at once, and say so.
   */
  useEffect(() => {
    function onVisibility() {
      if (statusRef.current !== "live") return;
      if (document.hidden) {
        awaySinceRef.current = Date.now();
        pauseClock();
        // The page may never run again: this is the last chance to keep what
        // was said, and the reason a locked phone no longer costs a lesson.
        flushBeacon();
        setInterrupted("paused");
        return;
      }
      const away = awaySinceRef.current ? Date.now() - awaySinceRef.current : 0;
      awaySinceRef.current = null;
      // A glance at a notification is picked up where it stopped. A phone
      // call is not: by then the connection is usually gone, and pretending
      // otherwise leaves somebody talking to a line that closed minutes ago.
      const alive = pcRef.current && ["connected", "connecting", "new"].includes(pcRef.current.connectionState);
      if (!alive || away > RESUME_GRACE_MS) {
        endInterrupted();
        return;
      }
      setInterrupted(null);
      // A call somebody deliberately paused stays paused: coming back to the
      // app is not the same as coming back to the conversation.
      if (!pausedRef.current) startClock();
      applyMic();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // The handler reads everything through refs, so it must be registered once
    // and never rebound: re-binding on each render would tear the listener down
    // and put it back in the middle of a call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Is there a conversation to pick back up?
   *
   * Asked once, on the way in, and only about spoken ones: the written chat
   * asks the same question about its own. A call that was interrupted is the
   * common case here, not the exception — that is what the testers were
   * describing — so the offer belongs on the screen before the start button,
   * not in a menu somewhere else.
   */
  useEffect(() => {
    if (lookedRef.current) return;
    lookedRef.current = true;
    void (async () => {
      try {
        // Arrived from the archive with one already chosen, or asking which
        // one was left unfinished. Either way the answer is an offer, never an
        // automatic call: opening a microphone needs a deliberate tap.
        const response = await fetch(reopen ? `/api/sessioni?id=${encodeURIComponent(reopen)}` : "/api/sessioni?kind=voice");
        const data = await response.json();
        if (!response.ok) return;
        if (reopen && Array.isArray(data.transcript) && data.transcript.length) {
          // The last thing Sam said, because that is the thing being answered
          // — quoting the opening line instead is how the screen ended up
          // naming a different conversation from the one just on screen.
          const lines = data.transcript as { role: string; content: string }[];
          const lastCoach = [...lines].reverse().find((line) => line.role === "assistant");
          setResumable({
            id: reopen,
            lastAt: "",
            exchanges: data.facts?.exchanges ?? 0,
            preview: lastCoach?.content?.slice(0, 160),
            continuing: true,
          });
          return;
        }
        if (data.resumable) setResumable(data.resumable);
      } catch {
        // No offer, no harm: the start button is right there.
      }
    })();
  }, [reopen]);

  /**
   * Keep the newest line in view.
   *
   * Without this the transcript simply grew and the page stayed where it was,
   * so whoever was speaking had to scroll with a finger to read what had just
   * been said — mid-sentence, in a foreign language, while listening. The jump
   * is instant rather than animated on purpose: a smooth scroll is still
   * travelling when the next line lands, and it would also fire scroll events
   * short of the bottom, which the handler below would read as the user
   * deliberately scrolling away.
   */
  useEffect(() => {
    const log = logRef.current;
    if (log && followRef.current) log.scrollTop = log.scrollHeight;
  }, [lines]);

  /** Reading something further up is a decision: stop dragging them back. */
  function onLogScroll(event: React.UIEvent<HTMLDivElement>) {
    const log = event.currentTarget;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    followRef.current = atBottom;
    setDetached(!atBottom);
  }

  function catchUp() {
    followRef.current = true;
    setDetached(false);
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }

  /**
   * The clock counts practice, not elapsed time.
   *
   * If it kept running through an incoming call it would credit minutes
   * nobody practised, and spend the ten-minute cap on a conversation Sam was
   * having with an empty room.
   */
  /**
   * Translates the session's events into the one word on screen.
   *
   * The names are matched rather than exhaustively switched because the
   * transport sends more than is listed here and will send more still: an
   * unrecognised event should leave the label alone, never blank it.
   */
  function markPhase(type: string) {
    // The full-duplex engine announces no turn boundaries at all, so the label
    // is inferred from the two streams instead of read off an event.
    if (engineRef.current === "live") {
      liveRef.current = onEvent(liveRef.current, type, Date.now());
      setPhase(liveRef.current.phase);
      return;
    }
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    if (type === "input_audio_buffer.speech_started") { setPhase("hearing"); return; }
    if (type === "input_audio_buffer.speech_stopped" || type === "response.created") {
      setPhase("thinking");
      // A promise that the far end will answer is not one this app can keep.
      // If nothing arrives, say the turn is free again rather than leave
      // "sta pensando" on screen forever.
      thinkingTimerRef.current = setTimeout(() => setPhase("waiting"), THINKING_TIMEOUT_MS);
      return;
    }
    if (type === "output_audio_buffer.started" || type === "response.output_audio.delta" || type === "response.output_item.added") {
      setPhase("speaking");
      return;
    }
    if (type === "response.done" || type === "output_audio_buffer.stopped") setPhase("waiting");
  }

  /**
   * The ring around the microphone, driven by how loudly it is actually
   * hearing. Read from the connection's statistics rather than from a Web
   * Audio analyser on purpose: building an audio context over the microphone
   * is the ordinary way to do this, and the last time this app touched the
   * audio session for a reason that looked safe, every speakerphone call went
   * silent. Statistics cannot route anything anywhere.
   */
  function startMeter(pc: RTCPeerConnection) {
    if (meterRef.current) return;
    meterRef.current = setInterval(() => {
      void pc
        .getStats()
        .then((report) => {
          const levels = levelsFromStats(report.values());
          levelRef.current = smoothLevel(levelRef.current, levels.mic);
          orbRef.current?.style.setProperty("--level", levelRef.current.toFixed(3));

          // The full-duplex engine announces no turn boundaries, and on this
          // transport the data channel may deliver nothing at all — so who is
          // talking is decided by listening to both directions rather than by
          // waiting for an event that may never come.
          if (engineRef.current !== "live") return;
          const now = Date.now();
          if (isAudible(levels.remote)) markPhase("session.output_audio.delta");
          else if (isAudible(levels.mic)) markPhase("session.input_transcript.delta");
          else {
            const next = onTick(liveRef.current, now);
            if (next.phase !== liveRef.current.phase) setPhase(next.phase);
            liveRef.current = next;
          }
        })
        .catch(() => undefined);
    }, 200);
  }

  function stopMeter() {
    if (meterRef.current) { clearInterval(meterRef.current); meterRef.current = null; }
    levelRef.current = 0;
    orbRef.current?.style.setProperty("--level", "0");
  }

  /**
   * Opens or closes the microphone to match the two controls.
   *
   * `enabled` rather than stopping the track: a stopped track cannot be
   * restarted without asking for the microphone again, which on iOS means a
   * permission prompt in the middle of a lesson. Disabled, the track keeps
   * flowing as silence — which is exactly what the far end should hear while
   * somebody is talking to a colleague.
   */
  function applyMic() {
    const open = !pausedRef.current;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = open; });
    if (!open) orbRef.current?.style.setProperty("--level", "0");
  }

  /** Everything stops: the microphone, the clock, and Sam mid-sentence. */
  function pauseCall() {
    if (statusRef.current !== "live" || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    applyMic();
    pauseClock();
    // Sam keeps talking to the room otherwise, which is the situation this
    // button exists to end.
    try { audioRef.current?.pause(); } catch { /* the element may be gone */ }
    setPhase("waiting");
    track("voice_paused", { where: engineRef.current });
  }

  /** And back. The connection was never closed, so this is immediate. */
  function resumeCall() {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    applyMic();
    try { void audioRef.current?.play().catch(() => null); } catch { /* ignore */ }
    if (!document.hidden) startClock();
    track("voice_resumed", { where: engineRef.current });
  }

  function startClock() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (!warnedRef.current && secondsRef.current >= WARNING_SECONDS) warnLastMinute();
      if (secondsRef.current >= MAX_SECONDS) endAtLimit();
    }, 1000);
  }

  /**
   * One minute left: say so, and ask Sam to land the plane.
   *
   * The notice alone would still leave him mid-sentence when the cap hits, so
   * the session is told too — as a plain conversation item, not a forced
   * response, which would talk over whoever is speaking right now. It reaches
   * him on his next turn, which is exactly when it should.
   */
  function warnLastMinute() {
    warnedRef.current = true;
    setNearLimit(true);
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    try {
      channel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: "The spoken session ends in about one minute. On your next turn, wrap up warmly: one short line on what they did well, then tell them the two of you will carry on in writing.",
          }],
        },
      }));
    } catch { /* the channel can close under us; the notice on screen is enough */ }
  }
  function pauseClock() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function cleanup(report: boolean) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    if (liveTickRef.current) { clearInterval(liveTickRef.current); liveTickRef.current = null; }
    if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
    stopMeter();
    // Whatever the Live engine was halfway through saying belongs in the
    // transcript: no event is coming to finish it.
    flushDrafts();
    liveLineRef.current = null; setStreaming(null);
    pcRef.current?.close(); pcRef.current = null;
    channelRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (report && secondsRef.current > 3) {
      // Whatever never made it into a flush travels with the ending, so the
      // last thing said is not the one line missing from the transcript.
      const left = pendingRef.current.slice(0, 40);
      const payload = JSON.stringify({
        seconds: secondsRef.current,
        transcript: linesRef.current.slice(-30).map((l) => ({ role: l.role, text: l.text.slice(0, 400) })),
        sessionId: sessionRef.current || null,
        mode: mode || "voice",
        leg: legRef.current,
        from: left[0]?.seq ?? 0,
        pending: left.map((l) => ({ role: l.role, text: l.text.slice(0, 2000) })),
      });
      const sent = navigator.sendBeacon?.("/api/voice/end", new Blob([payload], { type: "application/json" }));
      if (!sent) {
        fetch("/api/voice/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => null);
      }
    }
  }

  function push(role: "you" | "coach", text: string) {
    const clean = text.trim();
    if (!clean) return;
    liveLineRef.current = null;
    linesRef.current = [...linesRef.current.slice(-30), { role, text: clean }];
    setLines(linesRef.current);
    pendingRef.current = [...pendingRef.current, { seq: seqRef.current, role, text: clean }];
    seqRef.current += 1;
    // A handful of lines is worth a request on its own: the gap between what
    // has been said and what has been saved is the only thing an interruption
    // can take away.
    if (pendingRef.current.length >= 6) void flush();
  }

  /**
   * Saves what has been said since the last time.
   *
   * Lines stay pending until a request comes back saying they landed — never
   * because one was sent. A flush that is lost and repeated writes nothing
   * twice: the line numbers travel with the lines, and the server derives its
   * row ids from them.
   */
  async function flush(): Promise<void> {
    if (flushingRef.current) return;
    const batch = pendingRef.current.slice(0, 40);
    if (!batch.length || !sessionRef.current) return;
    flushingRef.current = true;
    try {
      const response = await fetch("/api/voice/turns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionRef.current,
          mode: mode || "voice",
          leg: legRef.current,
          from: batch[0].seq,
          lines: batch.map((line) => ({ role: line.role, text: line.text.slice(0, 2000) })),
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { sessionId?: string };
        if (data.sessionId) sessionRef.current = data.sessionId;
        pendingRef.current = pendingRef.current.slice(batch.length);
      }
    } catch {
      // Offline, or a lift. They stay pending and go with the next flush.
    } finally {
      flushingRef.current = false;
    }
  }

  /**
   * The flush for the moment the page is about to stop existing.
   *
   * A backgrounded page may be frozen or killed before a normal request
   * finishes, which is precisely the moment worth saving — so this leaves on
   * a beacon. Nothing is marked as saved: a beacon reports that it left, not
   * that it arrived, and the duplicate that a real flush may later write
   * costs nothing.
   */
  function flushBeacon() {
    const batch = pendingRef.current.slice(0, 40);
    if (!batch.length || !sessionRef.current || !navigator.sendBeacon) return;
    const payload = JSON.stringify({
      sessionId: sessionRef.current,
      mode: mode || "voice",
      leg: legRef.current,
      from: batch[0].seq,
      lines: batch.map((line) => ({ role: line.role, text: line.text.slice(0, 2000) })),
    });
    try {
      navigator.sendBeacon("/api/voice/turns", new Blob([payload], { type: "application/json" }));
    } catch {
      void flush();
    }
  }

  /**
   * A transcript fragment from the Live engine. Fragments accumulate until the
   * other side starts talking or the line has been quiet long enough, because
   * nothing ever arrives to say a sentence is finished.
   */
  function collect(role: "you" | "coach", delta: string) {
    const other = role === "you" ? "coach" : "you";
    if (draftRef.current[other]) {
      push(other, draftRef.current[other]);
      draftRef.current[other] = "";
    }
    draftRef.current[role] += delta;
  }

  /** Closes whatever is half-written, at the end of a turn or of the call. */
  function flushDrafts() {
    if (draftRef.current.you) { push("you", draftRef.current.you); draftRef.current.you = ""; }
    if (draftRef.current.coach) { push("coach", draftRef.current.coach); draftRef.current.coach = ""; }
  }

  /** Adopts the session the server answered with: the one being continued. */
  function adopt(data: { sessionId?: string; recap?: { role: "you" | "coach"; text: string }[] }) {
    if (!data?.sessionId) return;
    sessionRef.current = data.sessionId;
    if (Array.isArray(data.recap) && data.recap.length) {
      // What was already said, back on the screen: somebody who tapped
      // "riprendi" is continuing a conversation, and an empty transcript is
      // the app saying it does not remember it.
      linesRef.current = data.recap.slice(-30);
      setLines(linesRef.current);
      setResumedFrom(linesRef.current.length);
    }
  }

  async function start(engine: VoiceEngine = lastEngine(), resumeId?: string) {
    setStatus("connecting"); statusRef.current = "connecting";
    setResumable(null); setResumedFrom(0);
    sessionRef.current = newSessionId(); seqRef.current = 0; pendingRef.current = []; flushingRef.current = false;
    legRef.current = Math.random().toString(36).slice(2, 8);
    pausedRef.current = false; setPaused(false);
    setError(""); setLines([]); setSeconds(0); secondsRef.current = 0; linesRef.current = [];
    setInterrupted(null); awaySinceRef.current = null; setPhase("waiting");
    setNearLimit(false); setReachedLimit(false); warnedRef.current = false;
    followRef.current = true; setDetached(false);
    engineRef.current = engine;
    liveRef.current = INITIAL;
    draftRef.current = { you: "", coach: "" };
    liveLineRef.current = null; setStreaming(null);
    try {
      // Realtime mints a short-lived secret first and lets the browser
      // negotiate straight with OpenAI. Live takes the offer on our server
      // instead, so there is nothing to mint and nothing to hand out — which
      // means the session is asked for after the offer exists, not before.
      let tokenData: { clientSecret?: string; model?: string; error?: string; sessionId?: string; recap?: { role: "you" | "coach"; text: string }[] } = {};
      if (engine === "realtime") {
        const tokenResponse = await fetch("/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: mode || "voice", engine, resume: resumeId }) });
        tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error(tokenData.error || "Voice unavailable");
        adopt(tokenData);
      }

      // Asked for explicitly, not left to the browser's defaults. Without echo
      // cancellation the phone's loudspeaker feeds Sam's own voice straight
      // back into the microphone, the far end hears it as the learner
      // speaking, and it cuts Sam off mid-sentence — which is exactly what a
      // tester reported, and why it behaved on headphones: no speaker, no
      // acoustic path, no problem.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => null); }
      };
      const mic = stream.getAudioTracks()[0];
      // The most direct signal there is: the system mutes this track when
      // something else takes the audio session — a call, usually — and
      // unmutes it when it gives it back.
      mic.onmute = () => { if (statusRef.current === "live") { pauseClock(); setInterrupted("paused"); } };
      mic.onunmute = () => {
        if (statusRef.current !== "live" || document.hidden) return;
        setInterrupted(null);
        applyMic();
        if (!pausedRef.current) startClock();
      };
      mic.onended = () => { if (statusRef.current === "live") endInterrupted(); };
      pc.addTrack(mic, stream);

      // A connection that has genuinely failed must not leave a screen saying
      // "in conversazione". "disconnected" can recover on its own, so only the
      // final states end the call.
      pc.onconnectionstatechange = () => {
        if (statusRef.current !== "live") return;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") endInterrupted();
      };

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        // The turn-based engine greets on its own once the session is up. The
        // full-duplex one waits to be spoken to, which left Sam silent until
        // the learner said something first — an empty room where the coach
        // should have said hello. Asking for the opening is what starts it.
        if (engineRef.current !== "live") return;
        try {
          channel.send(JSON.stringify({ type: "response.create" }));
        } catch {
          // The opening is worth trying and never worth failing the call for.
        }
      };
      channel.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as { type?: string; transcript?: string; delta?: string };
          if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
            setStreaming(null);
            push("you", event.transcript);
          }
          if ((event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") && event.transcript) {
            setStreaming(null);
            push("coach", event.transcript);
          }
          // The words as they are said, instead of a block that lands when the
          // sentence is already over. A tester described repeating after Sam
          // and losing the thread waiting for the text to appear: on this
          // engine the deltas were arriving all along and were being thrown
          // away.
          if ((event.type === "response.output_audio_transcript.delta" || event.type === "response.audio_transcript.delta") && event.delta) {
            liveLineRef.current = { role: "coach", text: liveLineRef.current?.role === "coach" ? liveLineRef.current.text + event.delta : event.delta };
            setStreaming(liveLineRef.current);
          }
          if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) {
            liveLineRef.current = { role: "you", text: liveLineRef.current?.role === "you" ? liveLineRef.current.text + event.delta : event.delta };
            setStreaming(liveLineRef.current);
          }
          // Live sends transcripts only as fragments, with no completed event
          // and no item id — so a line is closed by a silence, not by a signal.
          if (event.type === "session.input_transcript.delta" && event.delta) collect("you", event.delta);
          if (event.type === "session.output_transcript.delta" && event.delta) collect("coach", event.delta);
          if (event.type) markPhase(event.type);
        } catch { /* non-JSON frame */ }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (engine === "live") {
        const liveResponse = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: mode || "voice", engine, sdp: offer.sdp, resume: resumeId }),
        });
        const liveData = (await liveResponse.json()) as { sdp?: string; error?: string; sessionId?: string; recap?: { role: "you" | "coach"; text: string }[] };
        if (!liveResponse.ok || !liveData.sdp) throw new Error(liveData.error || "Voice unavailable");
        adopt(liveData);
        await pc.setRemoteDescription({ type: "answer", sdp: liveData.sdp });
        // Nothing announces the end of a turn on this engine, so the label is
        // moved by the clock as well as by events.
        liveTickRef.current = setInterval(() => {
          const next = onTick(liveRef.current, Date.now());
          if (next.phase !== liveRef.current.phase) {
            liveRef.current = next;
            setPhase(next.phase);
            if (next.phase !== "speaking") flushDrafts();
          } else {
            liveRef.current = next;
          }
        }, 250);
      } else {
        const answerResponse = await fetch(`https://api.openai.com/v1/realtime/calls?model=${tokenData.model}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenData.clientSecret}`, "Content-Type": "application/sdp" },
          body: offer.sdp,
        });
        if (!answerResponse.ok) throw new Error("Voice connection failed");
        await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
      }

      setStatus("live"); statusRef.current = "live";
      startClock();
      startMeter(pc);
      // Saving on a rhythm as well as on a count: a slow, thoughtful
      // conversation produces few lines, and those are exactly the ones worth
      // keeping.
      if (!flushTimerRef.current) flushTimerRef.current = setInterval(() => { void flush(); }, 8000);
      // The chat stops introducing the microphone once it has been used for
      // real: the invitation is for people who have never seen this screen.
      try { localStorage.setItem("execlingo-voice-known", "1"); } catch { /* private browsing */ }
    } catch (e) {
      cleanup(false);
      statusRef.current = "error";
      setStatus("error");
      setError(e instanceof Error ? e.message : "Voice unavailable");
    }
  }

  function stop() {
    cleanup(true);
    statusRef.current = "ended";
    setStatus("ended");
  }

  /** The fifteen minutes are up: a pause, not a failure. */
  function endAtLimit() {
    cleanup(true);
    statusRef.current = "ended";
    setReachedLimit(true);
    setStatus("ended");
  }

  /** Ended by something outside the app rather than by the person. */
  function endInterrupted() {
    cleanup(true);
    statusRef.current = "ended";
    setInterrupted("lost");
    setStatus("ended");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline hidden />
      {status === "live" ? null : hero}

      {status === "idle" || status === "error" || status === "ended" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          {status === "ended" && reachedLimit ? (
            <>
              <h2>Facciamo una pausa ☕</h2>
              <p className="muted">Hai parlato <strong>{mm}:{ss}</strong>: è il massimo di una sessione a voce, e sono tutti registrati nei tuoi progressi. Non è successo niente — la lezione continua, adesso scrivendo.</p>
            </>
          ) : status === "ended" && interrupted === "lost" ? (
            <>
              <h2>Conversazione interrotta</h2>
              <p className="muted">Qualcosa ha preso il microfono — di solito è una telefonata in arrivo. I <strong>{mm}:{ss}</strong> che avevi fatto sono salvati nei tuoi progressi: il tempo dell&rsquo;interruzione non è stato contato.</p>
            </>
          ) : status === "ended" ? (
            <>
              <h2>Ottima sessione! 🎉</h2>
              <p className="muted">{mm}:{ss} di inglese parlato davvero, registrati nei tuoi progressi.</p>
            </>
          ) : (
            <>
              <h2>Parla con Sam</h2>
              <p className="muted">Una conversazione vera: ti ascolta, risponde e ti corregge con delicatezza. Serve il permesso del microfono, e dura al massimo 15 minuti.</p>
            </>
          )}
          {status === "error" ? <div className="notice" style={{ margin: "10px 0" }}>{error}</div> : null}
          {resumable && status !== "ended" ? (
            <div className="voiceResume">
              <p className="voiceResumeText">
                {resumable.continuing ? (
                  <>
                    🎙️ Stai continuando la conversazione di adesso.
                    {resumable.preview ? <> Sam ti aveva chiesto: «{resumable.preview}»</> : null}
                  </>
                ) : (
                  <>
                    🎙️ Avevi una conversazione a voce lasciata a metà.
                    {resumable.preview ? <> Sam ti aveva detto: «{resumable.preview}»</> : null} Se la ricorda e riparte da lì.
                  </>
                )}
              </p>
              <button
                type="button"
                className="primary full"
                data-track="session_resumed"
                onClick={() => { void start(lastEngine(), resumable.id); }}
              >
                {resumable.continuing ? "🎙️ Rispondi a voce" : "↩︎ Riprendi da dove eravate"}
              </button>
            </div>
          ) : null}
          {status === "ended" && reachedLimit ? (
            <>
              <a className="primary full voiceHandoff" href={HANDOFF_HREF}>✍️ Continuiamo a scrivere</a>
              <button className="secondary full" style={{ marginTop: 10 }} onClick={() => start()}>🎙️ Riprendi a voce</button>
              <p className="voiceHistoryLink">
                <Link href="/sessioni?tipo=voce" data-track="session_opened">🎧 Le tue conversazioni a voce</Link>
              </p>
            </>
          ) : (
            <>
              <p className="composerNote" style={{ marginTop: 10 }}>🎧 Prima di iniziare: alza il volume o metti le cuffie — Sam ti parlerà a voce.</p>
              <EngineStart onStart={start} again={status === "ended"} />
              <p className="voiceHistoryLink">
                <Link href="/sessioni?tipo=voce" data-track="session_opened">🎧 Le tue conversazioni a voce</Link>
              </p>
            </>
          )}
        </section>
      ) : null}

      {status === "connecting" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          <div className="voiceOrb pulsing">🎙️</div>
          <p className="muted" style={{ marginTop: 14 }}>Connessione in corso…</p>
        </section>
      ) : null}

      {status === "live" ? (
        <div className="voiceStage">
          <section className="card voiceLive">
            {/* The card is a column, and the head is its own row.
                It used to be a three-column grid — orb, timer, stop — which
                worked exactly as long as there were three children. Adding
                the controls put them into the same three columns, and they
                spilled off the side of the phone. */}
            <div className="voiceHead">
              <div
                ref={orbRef}
                className={
                  interrupted === "paused" || paused
                    ? "voiceOrb"
                    : `voiceOrb pulsing voiceOrbLive${phase === "hearing" ? " listening" : ""}`
                }
              >
                {paused ? "⏸" : "🎙️"}
              </div>
              <p className="voiceTimer">
                <span className="voicePhase">
                  {paused ? "Microfono chiuso" : interrupted === "paused" ? "In pausa" : PHASE_LABEL[phase]}
                  {phase === "thinking" && !interrupted && !paused ? <span className="voiceDots" aria-hidden>…</span> : null}
                </span>
                {/* Only there when the two sit on one line; the stylesheet
                    stacks them on a phone and hides it. */}
                <span className="voiceSep" aria-hidden> · </span>
                <span className="voiceClock">{mm}:{ss}</span>
              </p>
            </div>

            <p className="voiceHint">
              {paused
                ? "Sam aspetta e il tempo è fermo: puoi parlare con chi vuoi, non ti sente."
                : "Sam sta ascoltando: puoi mettere in pausa la conversazione o terminarla quando preferisci."}
            </p>

            <div className="voiceControls">
              <button
                type="button"
                className={paused ? "voiceMain voiceMainGo" : "voiceMain"}
                onClick={paused ? resumeCall : pauseCall}
              >
                {paused ? "🎙️ Avvia per parlare" : "⏸ Pausa"}
              </button>
              <button type="button" className="secondary voiceStop" onClick={stop}>⏹ Termina</button>
            </div>
            {nearLimit && !interrupted ? (
              <p className="voiceAlert">⏳ <strong>Ultimo minuto</strong> a voce — poi facciamo una pausa e continuiamo a scrivere.</p>
            ) : null}
            {interrupted === "paused" ? (
              <p className="voiceAlert">📞 Audio sospeso — probabilmente una telefonata. <strong>Il tempo è fermo</strong>: torna qui e riprendi da dove eravate.</p>
            ) : null}
          </section>
          {lines.length > 0 || streaming ? (
            <section className="card voiceTranscript">
              <div className="kicker">Trascrizione dal vivo</div>
              <div className="voiceLog" ref={logRef} onScroll={onLogScroll}>
                {lines.map((l, i) => (
                  <p key={i} className={i === resumedFrom - 1 && resumedFrom > 0 ? "voiceLine voiceLineResumed" : "voiceLine"}>
                    <strong style={{ color: l.role === "coach" ? "var(--brandText)" : "inherit" }}>{l.role === "coach" ? "Coach: " : "You: "}</strong>{l.text}
                    {/* A phrase heard in passing is the hardest kind to keep:
                        it is gone by the time you have found a pen. */}
                    {l.role === "coach" ? <RememberPhrase text={l.text} from="voice" compact /> : null}
                  </p>
                ))}
                {streaming && streaming.text.trim() ? (
                  <p className="voiceLine voiceLineLive">
                    <strong style={{ color: streaming.role === "coach" ? "var(--brandText)" : "inherit" }}>
                      {streaming.role === "coach" ? "Coach: " : "You: "}
                    </strong>
                    {streaming.text}
                  </p>
                ) : null}
                {detached ? (
                  <button type="button" className="voiceCatchUp" onClick={catchUp}>↓ Segui la conversazione</button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
