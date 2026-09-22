import { redirect } from "next/navigation";
import { BuddyChat } from "@/components/BuddyChat";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { lastLevelcheck } from "@/lib/learning/levelcheck";
import { NotificationReminder } from "@/components/NotificationReminder";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ mode?:string; q?:string; prima?:string; doc?:string; riprendi?:string }> }) {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql:"SELECT id FROM profiles WHERE id = ? LIMIT 1", args:[userId] });
  if (!profileResult.rows.length) redirect("/onboarding");
  const params = await searchParams; const mode = params.mode || "text-5";
  // The entry test is not something to retake on a bad afternoon. Within the
  // month it stays shut and the link goes to what Sam concluded last time:
  // two verdicts a fortnight apart cannot both be trusted, and the one that
  // gets believed is whichever flattered more.
  if (mode === "levelcheck") {
    const previous = await lastLevelcheck(userId).catch(() => null);
    if (previous?.locked) redirect(`/sessioni/${previous.sessionId}`);
  }
  const initialQuestion = params.q?.slice(0, 500);
  const first = params.prima === "1"; const doc = params.doc?.slice(0, 64);
  // A conversation reopened from the archive, by its id.
  const reopen = params.riprendi?.slice(0, 64);
  return <main className="shell"><div className="topbar"><div><div className="brand">Sam</div><div className="muted" style={{fontSize:12.5}}>Il tuo coach · {mode}</div></div><span style={{display:"flex",gap:6}}><a className="chip" href="/phrasebook" title="Il tuo frasario">★</a><a className="chip" href="/rescue">🆘</a><a className="chip" href="/home">Cambia</a></span></div><NotificationReminder /><BuddyChat mode={mode} initialQuestion={initialQuestion} first={first} doc={doc} reopen={reopen} /><BottomNav active="buddy" /></main>;
}
