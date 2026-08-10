import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderEmail, sendEmail } from "@/lib/email";

export const maxDuration = 60;

const OWNER_EMAIL = "ug@vaspitalia.com";

const SCHEMA = `CREATE TABLE IF NOT EXISTS model_watch (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);`;

// Dated snapshots (gpt-4o-2024-05-13) are noise; keep the meaningful families.
function interestingOpenAI(id: string): boolean {
  if (/\d{4}-\d{2}-\d{2}/.test(id)) return false;
  return /^(gpt|chatgpt|o[0-9])/.test(id) || /realtime|audio|tts|transcribe/.test(id);
}

async function openAIModels(): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => m.id).filter(interestingOpenAI);
  } catch {
    return [];
  }
}

async function anthropicModels(): Promise<string[]> {
  try {
    const response = await fetch("https://docs.claude.com/en/docs/about-claude/models/overview");
    if (!response.ok) return [];
    const html = await response.text();
    const ids = html.match(/claude-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
    return [...new Set(ids.filter((id) => !/\d{8}/.test(id)))];
  } catch {
    return [];
  }
}

/** Daily: detect newly released AI models and email the owner. */
async function run(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = db();
  await client.executeMultiple(SCHEMA);
  const knownRows = await client.execute("SELECT id, provider FROM model_watch");
  const known = new Set(knownRows.rows.map((r) => String(r.id)));
  const seededProviders = new Set(knownRows.rows.map((r) => String(r.provider)));

  const found: Array<{ provider: string; id: string }> = [
    ...(await openAIModels()).map((id) => ({ provider: "OpenAI", id })),
    ...(await anthropicModels()).map((id) => ({ provider: "Anthropic", id })),
  ];

  const fresh: Array<{ provider: string; id: string }> = [];
  for (const model of found) {
    if (known.has(model.id)) continue;
    await client.execute({ sql: "INSERT OR IGNORE INTO model_watch (id, provider) VALUES (?, ?)", args: [model.id, model.provider] });
    // First run for a provider only seeds the baseline — no email storm.
    if (seededProviders.has(model.provider)) fresh.push(model);
  }

  let emailed = false;
  if (fresh.length > 0) {
    const list = fresh.map((m) => `<li style="margin:4px 0;"><strong>${m.id}</strong> <span style="color:#8a917f;">(${m.provider})</span></li>`).join("");
    emailed = await sendEmail(
      OWNER_EMAIL,
      `🤖 ${fresh.length === 1 ? "Nuovo modello AI disponibile" : `${fresh.length} nuovi modelli AI disponibili`}`,
      renderEmail({
        preheader: "Possibile upgrade per ExecLingo: valuta con Claude se conviene adottarlo.",
        heading: "Novità dai laboratori AI",
        bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Rilevati nuovi modelli che potrebbero migliorare ExecLingo (voce, coach o notifiche):</p>
          <ul style="margin:0 0 14px;padding-left:20px;font-size:15px;color:#3a423b;">${list}</ul>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#6b736a;"><strong>Come procedere:</strong> apri la tua chat con Claude e scrivi ad esempio: <em>&ldquo;È uscito [nome modello]: valuta se e come aggiornare ExecLingo&rdquo;</em>. Claude confronterà qualità e costi con i modelli attuali e, se conviene, farà l&rsquo;aggiornamento e lo collauderà in produzione.</p>`,
        footerNote: "Ricevi questa email perché il monitoraggio modelli di ExecLingo è attivo (controllo quotidiano).",
      })
    );
  }

  return NextResponse.json({ ok: true, checked: found.length, fresh: fresh.map((m) => m.id), emailed });
}

export async function POST(request: Request) {
  return run(request);
}

// Vercel Cron invokes with GET (Authorization: Bearer CRON_SECRET).
export async function GET(request: Request) {
  return run(request);
}
