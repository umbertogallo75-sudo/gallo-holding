import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { analyseDocument, countPagesRoughly, MAX_BYTES, MAX_PAGES } from "@/lib/documents/analyse";
import { deleteDocument, saveDocument } from "@/lib/documents/store";

export const dynamic = "force-dynamic";
/** Reading a document and building a lesson from it is not a two-second job. */
export const maxDuration = 120;

/**
 * Turning a work document into a lesson.
 *
 * The file is read in memory, sent once, and dropped. Nothing is written to
 * disk and no copy is kept anywhere: what is stored is the summary, the
 * vocabulary and the questions — a few hundred words that make the training
 * possible, and nobody's contract sitting on a server.
 */
export async function POST(request: Request) {
  const userId = await requireUserId();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Caricamento non riuscito. Riprova." }, { status: 400 });
  }

  const file = form.get("file");
  const eventId = typeof form.get("eventId") === "string" ? String(form.get("eventId")) : null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Manca il file." }, { status: 400 });

  const name = file.name || "documento.pdf";
  if (!name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Per ora accetto solo PDF." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Il file è troppo grande (massimo ${Math.round(MAX_BYTES / 1_000_000)} MB). Prova a mandarmi solo le pagine che contano.` },
      { status: 413 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Refused before paying for the reading, when the file is willing to say how
  // long it is. Many PDFs are not, and those are counted properly afterwards.
  const rough = countPagesRoughly(bytes);
  if (rough !== null && rough > MAX_PAGES) {
    return NextResponse.json(
      { error: `Questo documento ha ${rough} pagine: ne leggo al massimo ${MAX_PAGES}. Mandami la parte su cui ti serve prepararti.` },
      { status: 413 }
    );
  }

  try {
    const analysis = await analyseDocument({ filename: name, base64: bytes.toString("base64") });
    if (analysis.pages > MAX_PAGES) {
      return NextResponse.json(
        { error: `Questo documento ha ${analysis.pages} pagine: ne leggo al massimo ${MAX_PAGES}. Mandami la parte su cui ti serve prepararti.` },
        { status: 413 }
      );
    }
    if (!analysis.terms.length && !analysis.questions.length) {
      return NextResponse.json(
        { error: "Da questo documento non sono riuscito a ricavare materiale utile. Se è una scansione poco leggibile, riprova con una copia migliore." },
        { status: 422 }
      );
    }
    const id = await saveDocument(userId, name, analysis, eventId);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("document analysis failed:", error);
    return NextResponse.json({ error: "Non sono riuscito a leggere questo documento. Riprova fra un momento." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Manca l'id." }, { status: 400 });
  await deleteDocument(id, userId);
  return NextResponse.json({ ok: true });
}
