import { tuneSamUtterance } from "@/lib/voice-prefs";

/**
 * Sam's voice inside a game.
 *
 * The device's own synthesiser is instant and free, which is what a game needs
 * when questions arrive one after another; the server voice is the fallback
 * for the Android shell, which has no synthesiser behind it. Neither is worth
 * an error: a game that cannot speak is quieter, not broken.
 */
export function say(text: string, rate = 0.9): void {
  try {
    if ("speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices();
      // An empty list means the voices have not loaded yet, not that there are
      // none — trying is still better than going straight to the network.
      if (!voices.length || voices.some((v) => v.lang.replace("_", "-").startsWith("en"))) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(tuneSamUtterance(new SpeechSynthesisUtterance(text), "en-US", rate));
        return;
      }
    }
  } catch {
    /* fall through to the server voice */
  }
  void fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, rate, lang: "en-US" }),
  })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      void audio.play().catch(() => undefined);
      audio.onended = () => URL.revokeObjectURL(url);
    })
    .catch(() => undefined);
}

export function hush(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing was speaking */
  }
}
