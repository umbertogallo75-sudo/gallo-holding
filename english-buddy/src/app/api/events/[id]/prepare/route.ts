import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { prepareForEvent } from "@/lib/ai/prep";
import { getEvent, savePrep } from "@/lib/events";
import { readNotes } from "@/lib/calendar/sync";
import { documentsForEvent } from "@/lib/documents/store";
import { ensureProfile, saveExpression } from "@/lib/learning/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prepares — or prepares again — the sheet for one appointment.
 *
 * An appointment that arrived from the calendar has nothing but a title, and a
 * title is a label: "Call Northwind" says nothing about what the fight is. So
 * the sheet is built when the user asks for it, by which time they have
 * usually said what it is really about and attached the papers — and asking
 * again after adding either is the whole point of the button.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await context.params;
  const database = db();

  const event = await getEvent(userId, id, database);
  if (!event) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const [notes, docs, profile, state] = await Promise.all([
    readNotes(userId, id, database),
    documentsForEvent(id, userId, database),
    database.execute({ sql: "SELECT professional_context FROM profiles WHERE id = ? LIMIT 1", args: [userId] }).catch(() => null),
    database.execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }).catch(() => null),
  ]);

  const documents = docs
    .map((doc) => `${doc.analysis.titleIt} (${doc.analysis.kind}): ${doc.analysis.summaryIt}\nEspressioni: ${doc.analysis.terms.map((t) => t.term).join(", ")}`)
    .join("\n\n")
    .slice(0, 4000);

  try {
    const prep = await prepareForEvent(
      event.title,
      profile?.rows[0]?.professional_context ? String(profile.rows[0].professional_context) : null,
      state?.rows[0]?.cefr_level ? String(state.rows[0].cefr_level) : null,
      notes,
      documents || null
    );
    await savePrep(userId, id, prep, database);
    await ensureProfile(userId, database);
    for (const phrase of prep.phrases) {
      await saveExpression(userId, phrase.english, phrase.italian, database).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("event prep failed:", error);
    return NextResponse.json({ error: "Non sono riuscito a preparare la scheda. Riprova fra un momento." }, { status: 502 });
  }
}
