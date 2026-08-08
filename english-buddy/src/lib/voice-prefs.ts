"use client";

/**
 * Sam's voice preferences for device speech synthesis: always male, gentle
 * delivery. System voices don't expose gender, so we prefer well-known male
 * voice names per platform (iOS, Android, Windows) and fall back gracefully.
 */

const MALE_NAMES: Record<string, string[]> = {
  it: ["luca", "cosimo", "diego", "giuseppe"],
  en: ["daniel", "aaron", "arthur", "alex", "evan", "nathan", "fred", "gordon", "oliver", "guy", "christopher", "eric", "andrew", "brian", "ryan", "james"],
};

export function pickSamVoice(lang: "it-IT" | "en-US" | "en-GB"): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.slice(0, 2);
    const forLang = voices.filter((v) => v.lang.replace("_", "-").startsWith(prefix));
    const male = forLang.find((v) => MALE_NAMES[prefix]?.some((name) => v.name.toLowerCase().includes(name)));
    return male || forLang.find((v) => v.lang.replace("_", "-").startsWith(lang)) || forLang[0] || null;
  } catch {
    return null;
  }
}

/** Gentle delivery: slightly slower, slightly warmer pitch. */
export function tuneSamUtterance(utterance: SpeechSynthesisUtterance, lang: "it-IT" | "en-US" | "en-GB", rate = 0.94) {
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = 1.04;
  const voice = pickSamVoice(lang);
  if (voice) utterance.voice = voice;
  return utterance;
}
