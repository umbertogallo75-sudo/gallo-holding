/**
 * Pure scheduling logic for Buddy notifications: time windows, intensity
 * levels, quiet hours and per-window dedupe. No I/O — fully unit-testable.
 */

export type Intensity = "low" | "normal" | "immersive";

export const WINDOWS = [
  { key: "morning", start: 8, end: 10 },
  { key: "late-morning", start: 10, end: 12 },
  { key: "lunch", start: 12, end: 14 },
  { key: "afternoon", start: 14, end: 16 },
  { key: "late-afternoon", start: 16, end: 18 },
  { key: "evening", start: 18, end: 21 },
] as const;

export type WindowKey = (typeof WINDOWS)[number]["key"];

const WINDOWS_BY_INTENSITY: Record<Intensity, WindowKey[]> = {
  low: ["evening"],
  normal: ["morning", "lunch", "evening"],
  immersive: WINDOWS.map((w) => w.key),
};

/** Local hour (0-23) and date key (YYYY-MM-DD) for a moment in a given IANA timezone. */
export function localParts(now: Date, timeZone: string): { hour: number; dateKey: string } {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour) % 24,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** True when `hour` falls inside the quiet range; the range may wrap midnight (e.g. 22 → 7). */
export function isQuietHour(hour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;
}

export function windowForHour(hour: number): WindowKey | null {
  const found = WINDOWS.find((w) => hour >= w.start && hour < w.end);
  return found ? found.key : null;
}

export type ShouldSendInput = {
  now: Date;
  timeZone: string;
  intensity: Intensity;
  quietStart: number;
  quietEnd: number;
  /** `kind` values already recorded for this user (kind embeds the local date). */
  alreadySentKinds: Set<string>;
};

/**
 * Decides whether a Buddy notification is due right now for a user.
 * Returns the dedupe `kind` (window + local date) to record, or null.
 */
export function shouldSend(input: ShouldSendInput): { kind: string; window: WindowKey } | null {
  const { hour, dateKey } = localParts(input.now, input.timeZone);
  if (isQuietHour(hour, input.quietStart, input.quietEnd)) return null;

  const window = windowForHour(hour);
  if (!window) return null;
  if (!WINDOWS_BY_INTENSITY[input.intensity].includes(window)) return null;

  const kind = `buddy:${window}:${dateKey}`;
  if (input.alreadySentKinds.has(kind)) return null;
  return { kind, window };
}
