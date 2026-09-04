import { NextResponse } from "next/server";
import { linkedUsers, syncCalendar } from "@/lib/calendar/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The nightly re-read of every connected calendar.
 *
 * A calendar changes without telling anyone: meetings move, get cancelled,
 * appear the evening before. Reading them all once a night is what makes the
 * morning reminder about tomorrow's call true rather than a day out of date.
 *
 * One account failing is not the others' problem — an address that has been
 * revoked would otherwise stop everybody else's calendar from being read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const users = await linkedUsers();
  let ok = 0, failed = 0;
  for (const userId of users) {
    try {
      await syncCalendar(userId);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error("calendar sync failed for a user:", error instanceof Error ? error.message : error);
    }
  }
  return NextResponse.json({ ok: true, calendars: users.length, synced: ok, failed });
}
