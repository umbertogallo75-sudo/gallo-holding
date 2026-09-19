import { tuneSamUtterance } from "@/lib/voice-prefs";

/**
 * Sam's voice inside a game.
 *
 * It used to prefer the device's own synthesiser, for speed. That was the
 * wrong trade for a listening game, and a tester said so plainly about
 * Ascolta e scegli: "brutto il rendering della voce". The reason is written
 * down elsewhere in this app already — on an Italian iPhone the built-in
 * voice reads English with an Italian accent, so the one thing the exercise
 * exists to train is the one thing it gets wrong.
 *
 * So the server voice plays, the same one as everywhere else, and the clips
 * are fetched a question ahead so the game stays quick. The device voice is
 * the fallback for when the network is gone, because a game that cannot speak
 * is quieter, not broken.
 */

const clips = new Map<string, string>();
let element: HTMLAudioElement | null = null;

/** Ten samples of silence: enough to unlock the element, inaudible to anyone. */
const SILENCE = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function key(text: string, rate: number, lang: string): string {
  return `${lang}|${rate}|${text}`;
}

/**
 * Wakes the audio element inside a tap.
 *
 * iOS only lets audio start from a user action, and a network round trip ends
 * that permission — so the element has to be woken synchronously while the
 * finger is still down, at the start of a run, and can be handed a real clip
 * afterwards.
 */
export function unlockGameAudio(): void {
  try {
    if (!element) element = new Audio();
    element.src = SILENCE;
    void element.play().catch(() => undefined);
  } catch {
    /* no audio on this device: the game is simply quieter */
  }
}

function device(text: string, rate: number): void {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(tuneSamUtterance(new SpeechSynthesisUtterance(text), "en-US", rate));
  } catch {
    /* quieter, not broken */
  }
}

async function fetchClip(text: string, rate: number, lang: string): Promise<string | null> {
  const cached = clips.get(key(text, rate, lang));
  if (cached) return cached;
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, rate, lang }),
    });
    if (!response.ok) return null;
    const url = URL.createObjectURL(await response.blob());
    clips.set(key(text, rate, lang), url);
    return url;
  } catch {
    return null;
  }
}

/** Fetches a clip without playing it, so the next question is already here. */
export function prime(text: string, rate = 0.9, lang = "en-US"): void {
  if (!text) return;
  void fetchClip(text, rate, lang);
}

export function say(text: string, rate = 0.9, lang = "en-US"): void {
  if (!text) return;
  void (async () => {
    const url = await fetchClip(text, rate, lang);
    if (!url) {
      device(text, rate);
      return;
    }
    try {
      if (!element) element = new Audio();
      element.src = url;
      element.currentTime = 0;
      await element.play();
    } catch {
      device(text, rate);
    }
  })();
}

/** Stops whatever is speaking: a new question must not land on the old one. */
export function hush(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing was speaking */
  }
  try {
    element?.pause();
  } catch {
    /* nothing was playing */
  }
}
