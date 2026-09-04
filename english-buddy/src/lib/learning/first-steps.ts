import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * The three things worth doing in the first days, and whether they are done.
 *
 * Every tester interviewed said the same thing about opening the app: they
 * did not know what they were supposed to do. The home screen answered
 * "here is today's session" and nothing else, which is an answer to a
 * different question — it says what to do now, not what this thing is or how
 * far in you are.
 *
 * So: three steps, ticked off from what the person has actually done rather
 * than from a box they checked. The second one is the spoken conversation,
 * deliberately: it is the thing nobody discovered on their own, and the thing
 * that sells the product in two minutes.
 */

export type FirstStep = {
  key: "level" | "voice" | "reminders";
  title: string;
  meta: string;
  doneMeta: string;
  href: string;
  done: boolean;
};

/** How long the checklist keeps offering itself before it stops asking. */
export const FIRST_STEPS_DAYS = 14;

const STEPS: Omit<FirstStep, "done">[] = [
  {
    key: "level",
    title: "Scopri il tuo livello",
    meta: "3 minuti di chiacchierata. Niente esame, niente voti",
    doneMeta: "Fatto — Sam sa da dove partire",
    href: "/buddy?mode=levelcheck",
  },
  {
    key: "voice",
    title: "Parla a voce con Sam",
    meta: "2 minuti: ti sente e ti risponde davvero",
    doneMeta: "Fatto — e puoi rifarlo quando vuoi",
    href: "/voice",
  },
  {
    key: "reminders",
    title: "Scegli quando ricordartelo",
    meta: "Un minuto, e non ci pensi più",
    doneMeta: "Fatto — Sam ti scrive nei momenti giusti",
    href: "/onboarding",
  },
];

/** A lookup that treats a missing table as "not done" rather than an error. */
async function exists(client: Client, sql: string, userId: string): Promise<boolean> {
  try {
    const result = await client.execute({ sql, args: [userId] });
    return result.rows.length > 0;
  } catch {
    // The push tables are created on first registration, so on a fresh
    // database they legitimately do not exist yet.
    return false;
  }
}

export async function firstSteps(userId: string, client: Client = db()): Promise<FirstStep[]> {
  const [modes, web, ios, android] = await Promise.all([
    client
      .execute({
        sql: "SELECT DISTINCT mode FROM sessions WHERE user_id = ? AND mode IN ('levelcheck', 'voice')",
        args: [userId],
      })
      .catch(() => ({ rows: [] as { mode?: unknown }[] })),
    exists(client, "SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1", userId),
    exists(client, "SELECT 1 FROM apns_tokens WHERE user_id = ? LIMIT 1", userId),
    exists(client, "SELECT 1 FROM fcm_tokens WHERE user_id = ? LIMIT 1", userId),
  ]);

  const done = new Set(modes.rows.map((row) => String(row.mode ?? "")));
  // Any of the three delivery routes counts: the question is whether Sam can
  // reach this person, not which phone they hold.
  const reachable = web || ios || android;

  return STEPS.map((step) => ({
    ...step,
    done: step.key === "level" ? done.has("levelcheck") : step.key === "voice" ? done.has("voice") : reachable,
  }));
}

/**
 * Whether to show the checklist at all.
 *
 * It goes away when it is finished, and it stops asking after a fortnight
 * even if it is not — somebody two weeks in has made their choice about the
 * microphone, and a permanent list of things they have not done is nagging,
 * not onboarding.
 */
export function showFirstSteps(steps: FirstStep[], dayOfPath: number): boolean {
  return dayOfPath <= FIRST_STEPS_DAYS && steps.some((step) => !step.done);
}
