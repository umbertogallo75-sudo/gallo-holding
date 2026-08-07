import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { coachInstructions } from "@/lib/ai/prompt";
import { runCoach } from "@/lib/ai/openai";

const skillNames = ["listening","speaking","business_conversation","vocabulary","grammar","pronunciation","fluency","comprehension"] as const;

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const database = db();
    const { message, mode = "text-5", sessionId: incomingSessionId } = await request.json();
    if (typeof message !== "string" || !message.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    let sessionId = incomingSessionId as string | undefined;
    if (!sessionId) {
      sessionId = randomUUID();
      await database.execute({ sql:"INSERT INTO sessions (id,user_id,mode,started_at) VALUES (?,?,?,?)", args:[sessionId,userId,mode,new Date().toISOString()] });
    }

    await database.execute({ sql:"INSERT INTO messages (id,user_id,session_id,role,content,created_at) VALUES (?,?,?,?,?,?)", args:[randomUUID(),userId,sessionId,"user",message,new Date().toISOString()] });

    const now = new Date().toISOString();
    const [stateResult,mistakesResult,expressionsResult,recentResult] = await Promise.all([
      database.execute({sql:"SELECT * FROM learning_state WHERE user_id = ? LIMIT 1",args:[userId]}),
      database.execute({sql:"SELECT incorrect,correct,category FROM mistakes WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 8",args:[userId]}),
      database.execute({sql:"SELECT expression,meaning FROM expressions WHERE user_id = ? AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 6",args:[userId,now]}),
      database.execute({sql:"SELECT role,content FROM messages WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 12",args:[userId,sessionId]}),
    ]);
    const state = stateResult.rows[0] as any;
    const recent = [...recentResult.rows].reverse() as any[];

    const result = await runCoach(coachInstructions({ level:state?.cefr_level as string|undefined, goal:state?.primary_goal as string|undefined, recentMistakes:mistakesResult.rows as any[], dueExpressions:expressionsResult.rows as any[], recentMessages:recent }, mode), message);
    await database.execute({ sql:"INSERT INTO messages (id,user_id,session_id,role,content,correction,created_at) VALUES (?,?,?,?,?,?,?)", args:[randomUUID(),userId,sessionId,"assistant",result.reply,result.correction || null,new Date().toISOString()] });

    for (const m of result.mistakes || []) {
      const existing = await database.execute({sql:"SELECT id,times_seen FROM mistakes WHERE user_id = ? AND incorrect = ? AND correct = ? LIMIT 1",args:[userId,m.incorrect,m.correct]});
      if (existing.rows.length) {
        const e = existing.rows[0] as any;
        await database.execute({sql:"UPDATE mistakes SET times_seen = ?, last_seen_at = ?, category = ?, note = ? WHERE id = ?",args:[Number(e.times_seen || 1)+1,new Date().toISOString(),m.category,m.note || null,e.id as string]});
      } else {
        await database.execute({sql:"INSERT INTO mistakes (id,user_id,incorrect,correct,category,note,last_seen_at) VALUES (?,?,?,?,?,?,?)",args:[randomUUID(),userId,m.incorrect,m.correct,m.category,m.note || null,new Date().toISOString()]});
      }
    }

    for (const ex of result.expressions || []) {
      const next = new Date(Date.now() + 24*60*60*1000).toISOString();
      await database.execute({sql:`INSERT INTO expressions (id,user_id,expression,meaning,next_review_at,created_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id,expression) DO NOTHING`,args:[randomUUID(),userId,ex.expression,ex.meaning || null,next,new Date().toISOString()]});
    }

    if (state && result.skill_updates) {
      const updates: string[] = []; const args: (string|number|null)[] = [];
      for (const skill of skillNames) {
        const delta = result.skill_updates[skill];
        if (typeof delta === "number") { updates.push(`${skill} = ?`); args.push(Math.max(0,Math.min(100,Number(state[skill] || 50)+delta))); }
      }
      if (updates.length) {
        updates.push("updated_at = ?"); args.push(new Date().toISOString(), userId);
        await database.execute({sql:`UPDATE learning_state SET ${updates.join(", ")} WHERE user_id = ?`,args});
      }
    }

    const day = new Date().toISOString().slice(0,10);
    const minutes = mode === "text-2" ? 2 : mode === "text-5" ? 5 : 10;
    await database.execute({sql:`INSERT INTO daily_metrics (user_id,day,minutes_practiced,interactions,expressions_reviewed) VALUES (?,?,?,?,0)
      ON CONFLICT(user_id,day) DO UPDATE SET minutes_practiced = minutes_practiced + excluded.minutes_practiced, interactions = interactions + excluded.interactions`,args:[userId,day,minutes,1]});

    return NextResponse.json({ ...result, sessionId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
