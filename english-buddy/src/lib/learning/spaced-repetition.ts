/**
 * Simple, honest spaced repetition. Intervals grow geometrically on success
 * and reset on failure. These are adaptive learning heuristics, not SM-2
 * orthodoxy — items resurface naturally inside conversations.
 */
export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 60;
export const MASTERY_MIN_SUCCESSES = 4;
export const MASTERY_MIN_INTERVAL_DAYS = 21;

export function nextIntervalDays(currentIntervalDays: number, success: boolean): number {
  if (!success) return MIN_INTERVAL_DAYS;
  const current = Math.max(MIN_INTERVAL_DAYS, currentIntervalDays || MIN_INTERVAL_DAYS);
  return Math.min(Math.round(current * 2.2 * 10) / 10, MAX_INTERVAL_DAYS);
}

export function isMastered(successCount: number, intervalDays: number): boolean {
  return successCount >= MASTERY_MIN_SUCCESSES && intervalDays >= MASTERY_MIN_INTERVAL_DAYS;
}

export function nextReviewAt(intervalDays: number, from = new Date()): string {
  return new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
}
