import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * What has actually left, and when.
 *
 * A cold sending domain is warmed by a steady trickle, not by guessing — and
 * the one number that matters while warming is how many messages went out on
 * a given day. Without this the ramp is invisible until it has already gone
 * wrong.
 */
export type EmailStat = { kind: string; total: number; last7: number; lastAt: string | null };

const LABELS: Record<string, string> = {
  welcome_trial: "Benvenuto (con offerta 24 ore)",
  trial_reminder: "Prova in scadenza",
  trial_extended: "Prova estesa — ricompensa",
  trial_ended: "Prova finita",
  win_back_soft: "Sollecito 3 giorni — morbido",
  win_back_firm: "Sollecito 7 giorni — diretto",
  win_back_hard: "Sollecito 15 giorni — duro",
  win_back_reminder: "Promemoria ogni 5 giorni",
  evening_recap: "Riepilogo della sera",
  campaign: "Campagna scritta da te",
};

export function emailLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

export async function emailStats(client: Client = db(), days = 30): Promise<{ rows: EmailStat[]; total: number; unsubscribed: number }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  try {
    const [sends, optOuts] = await Promise.all([
      client.execute({
        sql: `SELECT kind,
                     COUNT(*) AS total,
                     SUM(CASE WHEN sent_at >= ? THEN 1 ELSE 0 END) AS last7,
                     MAX(sent_at) AS last_at
              FROM email_sends WHERE sent_at >= ? GROUP BY kind ORDER BY total DESC`,
        args: [week, since],
      }),
      client.execute("SELECT COUNT(*) AS n FROM email_prefs WHERE unsubscribed_at IS NOT NULL"),
    ]);
    const rows = sends.rows.map((row) => ({
      kind: String(row.kind),
      total: Number(row.total ?? 0),
      last7: Number(row.last7 ?? 0),
      lastAt: row.last_at ? String(row.last_at) : null,
    }));
    return {
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      unsubscribed: Number(optOuts.rows[0]?.n ?? 0),
    };
  } catch {
    // Nothing has been sent yet, so the tables do not exist. An empty table is
    // the honest answer, not an error page over the whole dashboard.
    return { rows: [], total: 0, unsubscribed: 0 };
  }
}
