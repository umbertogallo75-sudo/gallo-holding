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
 *
 * The rule is "the latest window that has already begun", not "the window we
 * are standing in", and that difference is the whole point. The scheduler is
 * driven by a hosted cron that asks for sixteen runs a day and, on a busy
 * morning, delivers four: measured over a week, the runs landed around 11:00,
 * 16:15 and 20:15 Rome time. Under the old rule somebody on the normal
 * intensity — morning, lunch, evening — was never once looked at inside the
 * morning or the lunch window, so two of their three notifications simply did
 * not exist. Now a run at 11:00 finds the morning still unsent and sends it.
 *
 * Only the latest begun window is considered, never the ones before it, so a
 * quiet day cannot pile up into four notifications at nine in the evening. A
 * missed window is caught up until the next one opens, and then let go.
 */
export function shouldSend(input: ShouldSendInput): { kind: string; window: WindowKey } | null {
  const { hour, dateKey } = localParts(input.now, input.timeZone);
  if (isQuietHour(hour, input.quietStart, input.quietEnd)) return null;

  const enabled = WINDOWS_BY_INTENSITY[input.intensity];
  const begun = WINDOWS.filter((w) => enabled.includes(w.key) && hour >= w.start);
  const latest = begun[begun.length - 1];
  if (!latest) return null;

  const kind = `buddy:${latest.key}:${dateKey}`;
  if (input.alreadySentKinds.has(kind)) return null;
  return { kind, window: latest.key };
}
