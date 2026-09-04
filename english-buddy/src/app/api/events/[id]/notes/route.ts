import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { saveNotes } from "@/lib/calendar/sync";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ notes: z.string().max(2000) });

/** What the user knows about this meeting that the calendar does not say. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  await saveNotes(userId, id, parsed.data.notes);
  return NextResponse.json({ ok: true });
}
