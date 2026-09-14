import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { closeSession, recentSessions, resumableSession, sessionReport, sessionTranscript } from "@/lib/learning/sessions";

export const dynamic = "force-dynamic";

/**
 * Sessions: the one you were in the middle of, the ones you have had, and the
 * end of one. Everything here reads what was already being stored — the only
 * thing that was missing was a way to ask for it.
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const [transcript, report] = await Promise.all([
      sessionTranscript(userId, id),
      sessionReport(userId, id).catch(() => null),
    ]);
    if (transcript.length === 0) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
    return NextResponse.json({ transcript, ...(report ?? {}) });
  }

  const [resumable, recent] = await Promise.all([
    resumableSession(userId).catch(() => null),
    url.searchParams.get("all") === "1" ? recentSessions(userId).catch(() => []) : Promise.resolve([]),
  ]);
  return NextResponse.json({ resumable, recent });
}

const bodySchema = z.object({ action: z.literal("close"), sessionId: z.string().min(8).max(64) });

/** Finishing a session on purpose, and getting told how it went. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "sessions"), 60, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi" }, { status: 400 });

  // The report is taken before closing, so a failure to close never costs the
  // learner the only thing they were waiting to see.
  const report = await sessionReport(userId, parsed.data.sessionId).catch(() => null);
  await closeSession(userId, parsed.data.sessionId);
  return NextResponse.json({ ok: true, ...(report ?? {}) });
}
