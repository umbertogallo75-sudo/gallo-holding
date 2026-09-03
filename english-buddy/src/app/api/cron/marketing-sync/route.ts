import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { claimMarketingManualLease, claimMarketingRun } from "@/lib/marketing/collector-store";
import {
  executeClaimedMarketingRun,
  manualMarketingSlot,
  retryMarketingReportEmail,
} from "@/lib/marketing/performance-report";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  // Reports are owner-triggered from ADMIN. Scheduled GitHub wake-ups stay
  // harmless for backwards compatibility and never collect or send email.
  if (!force) {
    return NextResponse.json({ ok: true, skipped: "manual_only" });
  }
  const slot = manualMarketingSlot(now);

  const database = db();
  if (!(await claimMarketingManualLease(slot.runKey, database, now))) {
    return NextResponse.json({ ok: false, error: "manual_report_locked" }, { status: 409 });
  }
  const claim = await claimMarketingRun(
    { runKey: slot.runKey, scheduledFor: slot.scheduledFor },
    database,
    now,
  );
  if (!claim.claimed) {
    const emailRetry = claim.run.status !== "running" && claim.run.emailStatus !== "sent"
      ? await retryMarketingReportEmail(claim.run.runKey, database)
      : { attempted: false, sent: claim.run.emailStatus === "sent" };
    return NextResponse.json({
      ok: true,
      skipped: "already_claimed",
      runKey: claim.run.runKey,
      status: claim.run.status,
      emailRetry,
    });
  }

  try {
    const result = await executeClaimedMarketingRun(slot.runKey, now, database);
    return NextResponse.json({
      ok: true,
      runKey: result.snapshot.run.runKey,
      status: result.snapshot.run.status,
      emailSent: result.emailSent,
      semaphore: result.report.semaphore,
      completedAt: result.snapshot.run.completedAt,
    });
  } catch (error) {
    console.error("marketing sync failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "collector_failed", runKey: slot.runKey }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
