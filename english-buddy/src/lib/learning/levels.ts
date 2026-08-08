/**
 * Automatic CEFR progression (Phase 5). Skill estimates (0-100, updated with
 * small evidence-based deltas every turn) map to CEFR bands; the level moves
 * at most ONE step at a time so a lucky streak can't jump a user two levels.
 */

export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1"] as const;
export type CefrLevel = (typeof CEFR_ORDER)[number];

export function bandForScore(average: number): CefrLevel {
  if (average < 40) return "A1";
  if (average < 52) return "A2";
  if (average < 64) return "B1";
  if (average < 76) return "B2";
  return "C1";
}

/** One step from `current` toward `target`; unknown levels normalize to A2. */
export function stepToward(current: string, target: CefrLevel): CefrLevel {
  const from = CEFR_ORDER.includes(current as CefrLevel) ? (current as CefrLevel) : "A2";
  const fromIndex = CEFR_ORDER.indexOf(from);
  const targetIndex = CEFR_ORDER.indexOf(target);
  if (targetIndex > fromIndex) return CEFR_ORDER[fromIndex + 1];
  if (targetIndex < fromIndex) return CEFR_ORDER[fromIndex - 1];
  return from;
}
