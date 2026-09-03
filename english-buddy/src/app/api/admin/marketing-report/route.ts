import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-access";
import { db } from "@/lib/db";
import {
  claimMarketingManualLease,
  claimMarketingRun,
  readLatestMarketingRun,
} from "@/lib/marketing/collector-store";
import {
  executeClaimedMarketingRun,
  manualMarketingSlot,
  retryMarketingReportEmail,
} from "@/lib/marketing/performance-report";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MANUAL_COOLDOWN_MS = 5 * 60_000;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Runs the performance collector from the authenticated Admin dashboard.
 * The server owns every credential: the browser sends only its signed session
 * cookie and never sees CRON_SECRET or a provider access token.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Richiesta non autorizzata." }, 403);
  }

  const session = await getAuthSession();
  if (!session || !(await isAdminUser(session.userId, session.method))) {
    return json({ error: "Sessione ADMIN non valida. Accedi nuovamente." }, 403);
  }

  const payload: unknown = await request.json().catch(() => null);
  const sendReportEmail = typeof payload === "object"
    && payload !== null
    && !Array.isArray(payload)
    && (payload as Record<string, unknown>).sendEmail === true;

  const now = new Date();
  const database = db();
  const latest = await readLatestMarketingRun(database);

  const latestCompletedAt = latest?.completedAt ? new Date(latest.completedAt).getTime() : Number.NaN;
  if (
    latest &&
    (latest.status === "success" || latest.status === "partial") &&
    Number.isFinite(latestCompletedAt) &&
    now.getTime() - latestCompletedAt < MANUAL_COOLDOWN_MS
  ) {
    const emailRetry = sendReportEmail && latest.emailStatus !== "sent"
      ? await retryMarketingReportEmail(latest.runKey, database)
      : { attempted: false, sent: latest.emailStatus === "sent" };
    return json({
      ok: true,
      reused: true,
      status: latest.status,
      emailSent: latest.emailStatus === "sent" || emailRetry.sent,
      emailRequested: sendReportEmail,
      completedAt: latest.completedAt,
    });
  }

  const slot = manualMarketingSlot(now);
  const leaseClaimed = await claimMarketingManualLease(slot.runKey, database, now, MANUAL_COOLDOWN_MS);
  if (!leaseClaimed) {
    return json({ error: "Un aggiornamento è già in corso oppure è terminato da meno di cinque minuti." }, 409);
  }
  const claim = await claimMarketingRun(
    { runKey: slot.runKey, scheduledFor: slot.scheduledFor },
    database,
    now,
  );

  // The five-minute key makes a double click idempotent. A second browser or
  // a refreshed page therefore cannot start the same collection twice.
  if (!claim.claimed) {
    if (claim.run.status === "running") {
      return json({ error: "Un aggiornamento del report è già in corso. Attendi qualche secondo." }, 409);
    }

    if (claim.run.status === "failed") {
      return json({ error: "Il tentativo appena avviato non è riuscito. Riprova tra qualche minuto." }, 500);
    }

    const emailRetry = sendReportEmail && claim.run.emailStatus !== "sent"
      ? await retryMarketingReportEmail(claim.run.runKey, database)
      : { attempted: false, sent: claim.run.emailStatus === "sent" };
    return json({
      ok: true,
      reused: true,
      status: claim.run.status,
      emailSent: claim.run.emailStatus === "sent" || emailRetry.sent,
      emailRequested: sendReportEmail,
      completedAt: claim.run.completedAt,
    });
  }

  try {
    const result = await executeClaimedMarketingRun(slot.runKey, now, database, { sendReportEmail });
    return json({
      ok: true,
      reused: false,
      status: result.snapshot.run.status,
      emailSent: result.emailSent,
      emailRequested: sendReportEmail,
      semaphore: result.report.semaphore,
      completedAt: result.snapshot.run.completedAt,
    });
  } catch (error) {
    console.error("admin marketing report failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Non sono riuscito ad aggiornare il report. Nessun dato è stato inventato: riprova tra qualche minuto." }, 500);
  }
}
