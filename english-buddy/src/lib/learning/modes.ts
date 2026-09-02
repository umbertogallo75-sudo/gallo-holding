/**
 * Every activity the coach can run, in one list.
 *
 * It used to live inline in the API's request schema while the first-session
 * chooser picked from its own set of strings — and the two drifted: the
 * chooser could pick "negotiation" for an advanced sales profile, the schema
 * had never heard of it, and the very first session of those users was
 * rejected before it began. One list, and a test that holds the chooser to
 * it.
 */
export const COACH_MODES = [
  "text-2",
  "text-5",
  "guided",
  "surprise",
  "buddy",
  "essentials",
  "zero",
  "mission",
  "negotiation",
  "listen",
  "review",
  "warmup",
  "shadow",
  "briefing",
  "levelcheck",
] as const;

export type CoachMode = (typeof COACH_MODES)[number];

/** Roughly how long each activity takes, for the practice minutes recorded. */
export const MODE_MINUTES: Record<CoachMode, number> = {
  "text-2": 2,
  "text-5": 5,
  guided: 10,
  surprise: 5,
  buddy: 3,
  essentials: 7,
  zero: 4,
  mission: 7,
  negotiation: 8,
  listen: 5,
  review: 3,
  warmup: 5,
  shadow: 4,
  briefing: 3,
  levelcheck: 3,
};
