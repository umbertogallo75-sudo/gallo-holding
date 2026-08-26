/**
 * The escalation ladder for somebody who has stopped opening the app.
 *
 * Three letters that get progressively more direct — three days, a week, a
 * fortnight — and then a short reminder every five days. The tone is meant to
 * harden, not to nag: the first is a hand on the shoulder, the last says the
 * uncomfortable thing out loud.
 */
export type WinBackStage = "soft" | "firm" | "hard" | "reminder";
export type WinBackStep = { stage: WinBackStage; index: number };

export const SOFT_DAYS = 3;
export const FIRM_DAYS = 7;
export const HARD_DAYS = 15;
export const REMINDER_EVERY_DAYS = 5;

/**
 * Where the reminders stop.
 *
 * Not a detail: writing forever to somebody who has plainly gone is how a
 * sender's reputation is spent, and it is spent on behalf of everybody else
 * on the list — the people still reading would be the ones who pay for it in
 * the spam folder. Six reminders reach day 45; after that the silence is an
 * answer, and it is respected.
 */
export const MAX_REMINDERS = 6;

/**
 * Which letter, if any, is due after this many days of silence. Pure, so the
 * ladder can be read and tested without a database anywhere near it.
 */
export function winBackFor(days: number): WinBackStep | null {
  if (!Number.isFinite(days) || days < SOFT_DAYS) return null;
  if (days < FIRM_DAYS) return { stage: "soft", index: 0 };
  if (days < HARD_DAYS) return { stage: "firm", index: 0 };
  if (days < HARD_DAYS + REMINDER_EVERY_DAYS) return { stage: "hard", index: 0 };
  const index = Math.floor((days - HARD_DAYS) / REMINDER_EVERY_DAYS);
  if (index > MAX_REMINDERS) return null;
  return { stage: "reminder", index };
}

/**
 * The claim key for one step of one lapse.
 *
 * `lapseSince` — the day they were last seen — is in the key on purpose: it
 * is what makes the ladder start again from the beginning if somebody comes
 * back and then drifts away a second time. Without it the keys would be
 * spent for good, and a returning user who lapsed again would never hear
 * from us at all.
 */
export function winBackKey(userId: string, step: WinBackStep, lapseSince: string): string {
  const name = step.stage === "reminder" ? `win_back_r${step.index}` : `win_back_${step.stage}`;
  return `${userId}:${name}:${lapseSince}`;
}

export function winBackKind(step: WinBackStep): string {
  return step.stage === "reminder" ? "win_back_reminder" : `win_back_${step.stage}`;
}
