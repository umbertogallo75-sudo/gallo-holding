import { redirect } from "next/navigation";
import { BuddyChat } from "@/components/BuddyChat";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ mode?:string; q?:string }> }) {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql:"SELECT id FROM profiles WHERE id = ? LIMIT 1", args:[userId] });
  if (!profileResult.rows.length) redirect("/onboarding");
  const params = await searchParams; const mode = params.mode || "text-5";
  const initialQuestion = params.q?.slice(0, 500);
  return <main className="shell"><div className="topbar"><div><div className="brand">English Buddy</div><div className="muted" style={{fontSize:12}}>Mode · {mode}</div></div><a className="chip" href="/home">Change</a></div><BuddyChat mode={mode} initialQuestion={initialQuestion} /><BottomNav active="buddy" /></main>;
}
