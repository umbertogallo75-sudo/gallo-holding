import { redirect } from "next/navigation";
import { BuddyChat } from "@/components/BuddyChat";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationReminder } from "@/components/NotificationReminder";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ mode?:string; q?:string; prima?:string; doc?:string }> }) {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql:"SELECT id FROM profiles WHERE id = ? LIMIT 1", args:[userId] });
  if (!profileResult.rows.length) redirect("/onboarding");
  const params = await searchParams; const mode = params.mode || "text-5";
  const initialQuestion = params.q?.slice(0, 500);
  const first = params.prima === "1"; const doc = params.doc?.slice(0, 64);
  return <main className="shell"><div className="topbar"><div><div className="brand">Sam</div><div className="muted" style={{fontSize:12.5}}>Il tuo coach · {mode}</div></div><span style={{display:"flex",gap:6}}><a className="chip" href="/rescue">🆘</a><a className="chip" href="/home">Cambia</a></span></div><NotificationReminder /><BuddyChat mode={mode} initialQuestion={initialQuestion} first={first} doc={doc} /><BottomNav active="buddy" /></main>;
}
