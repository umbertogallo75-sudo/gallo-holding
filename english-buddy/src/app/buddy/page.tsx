import { BuddyChat } from "@/components/BuddyChat";
import { BottomNav } from "@/components/BottomNav";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ mode?:string; q?:string }> }) {
  const params = await searchParams; const mode = params.mode || "text-5";
  const initialQuestion = params.q?.slice(0, 500);
  return <main className="shell"><div className="topbar"><div><div className="brand">English Buddy</div><div className="muted" style={{fontSize:12}}>Mode · {mode}</div></div><a className="chip" href="/home">Change</a></div><BuddyChat mode={mode} initialQuestion={initialQuestion} /><BottomNav active="buddy" /></main>;
}
