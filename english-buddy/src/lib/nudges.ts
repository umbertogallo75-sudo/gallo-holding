import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth";
import { isEmailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { billingEnforced, getEntitlement } from "@/lib/stripe";

/**
 * Netflix-style upgrade emails: the store apps show no purchase flows, so
 * the email channel does the selling. Locked accounts get one nudge the day
 * after registration and one more on day three. Each (user, kind) pair is
 * sent at most once — an INSERT OR IGNORE claim makes the hourly cron safe.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS email_nudges (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, kind)
);`;

const MAX_SENDS_PER_RUN = 50;

type Sender = (to: string, subject: string, html: string, text?: string) => Promise<boolean>;

function base(): string {
  return (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
}

function day1Email(name: string): { subject: string; html: string; text: string } {
  const url = `${base()}/abbonamento`;
  return {
    subject: "Sam ti aspetta — ecco come sbloccare il tuo coach",
    html: renderEmail({
      preheader: "Accedi dal sito con la tua email e attiva il piano: due minuti e sei operativo.",
      heading: `${name ? name + ", il" : "Il"} tuo coach è pronto.`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Hai creato il tuo account ExecLingo — il primo passo è fatto. Per allenarti ogni giorno con <strong>Sam</strong> (chat e voce, missioni business, Meeting Warm-up, English Rescue) ti manca solo il piano.</p>
        <p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">👉 <strong>Come si fa</strong>: apri <strong>execlingo.it</strong> dal browser, <strong>accedi con la tua email</strong> e scegli il piano. L&rsquo;app sul telefono si sblocca da sola, con lo stesso account.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b736a;">🏢 La tua azienda ti ha dato un codice? Inseriscilo in Profilo → Abbonamento e non serve altro.</p>`,
      ctaLabel: "Accedi e attiva il tuo piano",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché hai un account ExecLingo senza piano attivo.",
    }),
    text: `${name ? name + ", il" : "Il"} tuo coach è pronto.\n\nPer allenarti ogni giorno con Sam ti manca solo il piano:\n1) apri execlingo.it dal browser\n2) accedi con la tua email\n3) scegli il piano — l'app si sblocca da sola\n\n${url}\n\nHai un codice aziendale? Inseriscilo in Profilo → Abbonamento.\n\nExecLingo · un servizio VASP ITALIA SRL`,
  };
}

function day3Email(name: string): { subject: string; html: string; text: string } {
  const url = `${base()}/abbonamento`;
  return {
    subject: "In 3 mesi operativo in inglese — il percorso completo",
    html: renderEmail({
      preheader: "Il 3-Month Executive Path: un pagamento, tre mesi, capacità reali.",
      heading: `${name ? name + "," : "Ciao,"} facciamo sul serio?`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Riunioni, call, trasferte: l&rsquo;inglese operativo non arriva da solo — arriva con <strong>pochi minuti al giorno, tutti i giorni</strong>, guidati da un coach che ti conosce.</p>
        <p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Il <strong>3-Month Executive Path (99,90 € una volta, IVA inclusa)</strong> è il percorso completo: da dove sei oggi a operativo, con progressi misurati su capacità reali. In alternativa c&rsquo;è il mensile senza vincoli.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b736a;">Accedi dal sito con la tua email: attivi in due minuti e l&rsquo;app si sblocca subito, sul telefono e sul computer.</p>`,
      ctaLabel: "Inizia il Programma 3 mesi",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché hai un account ExecLingo senza piano attivo. È l'ultima di questa serie.",
    }),
    text: `${name ? name + "," : "Ciao,"} facciamo sul serio?\n\nIl 3-Month Executive Path (99,90 € una volta, IVA inclusa) è il percorso completo verso l'inglese operativo. In alternativa c'è il mensile senza vincoli.\n\nAccedi dal sito con la tua email e attiva in due minuti: ${url}\n\nExecLingo · un servizio VASP ITALIA SRL`,
  };
}

/** Runs the nudge pass. Quiet outside 07-18 UTC so emails land in daytime. */
export async function runUpgradeNudges(
  client: Client = db(),
  now: Date = new Date(),
  send: Sender | null = null
): Promise<Record<string, number | string>> {
  const sender = send ?? sendEmail;
  if (!send && (!billingEnforced() || !isEmailConfigured())) return { skipped: "config" };
  const hour = now.getUTCHours();
  if (hour < 7 || hour > 18) return { skipped: "quiet-hours" };

  try {
    await client.executeMultiple(SCHEMA);
  } catch { /* concurrent create */ }

  // Cutoff from the caller's clock, not SQLite's, so runs are reproducible.
  const cutoff = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const candidates = await client.execute({
    sql: "SELECT id, email, display_name, created_at FROM auth_users WHERE email IS NOT NULL AND email != '' AND created_at <= ?",
    args: [cutoff],
  });

  let day1 = 0, day3 = 0, sends = 0;
  for (const row of candidates.rows) {
    if (sends >= MAX_SENDS_PER_RUN) break;
    const userId = String(row.id);
    if (userId === OWNER_ID) continue;
    const email = String(row.email);
    if (/@example\./i.test(email)) continue;

    const entitlement = await getEntitlement(userId, client);
    if (entitlement.access) continue;

    const createdAt = Date.parse(String(row.created_at).replace(" ", "T") + "Z");
    const ageDays = Number.isFinite(createdAt) ? (now.getTime() - createdAt) / 86_400_000 : 0;
    if (ageDays < 1) continue;

    const kind = ageDays >= 3 ? "day3" : "day1";
    // day3 goes out only to accounts that already received day1.
    if (kind === "day3") {
      const prior = await client.execute({ sql: "SELECT 1 FROM email_nudges WHERE user_id = ? AND kind = 'day1' LIMIT 1", args: [userId] });
      if (!prior.rows.length) {
        const claimed = await client.execute({ sql: "INSERT OR IGNORE INTO email_nudges (user_id, kind) VALUES (?, 'day1')", args: [userId] });
        if (claimed.rowsAffected > 0) {
          const message = day1Email(String(row.display_name ?? ""));
          if (await sender(email, message.subject, message.html, message.text)) { day1++; sends++; }
        }
        continue;
      }
    }

    const claimed = await client.execute({ sql: "INSERT OR IGNORE INTO email_nudges (user_id, kind) VALUES (?, ?)", args: [userId, kind] });
    if (claimed.rowsAffected === 0) continue;
    const message = kind === "day1" ? day1Email(String(row.display_name ?? "")) : day3Email(String(row.display_name ?? ""));
    if (await sender(email, message.subject, message.html, message.text)) {
      if (kind === "day1") day1++; else day3++;
      sends++;
    }
  }
  return { day1, day3 };
}
