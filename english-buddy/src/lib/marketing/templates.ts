import { renderEmail } from "@/lib/email";
import type { Message } from "./send";
import { appBase, trialUrl, unsubscribeUrl } from "./tokens";

/**
 * Every lifecycle email, in one file, so the whole voice can be read at once.
 *
 * They are coaching first and marketing second, in that order and on purpose:
 * the product only works if the person opens the app, so an email that makes
 * them practise has already done more for the business than one that asks
 * them to buy.
 */
const P = `margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;`;
const SMALL = `margin:0;font-size:14px;line-height:1.6;color:#6b736a;`;

function firstName(name: string | null | undefined): string {
  const clean = (name ?? "").trim().split(/\s+/)[0];
  return clean.length > 1 ? clean : "";
}
function hello(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `${first}, ` : "";
}

/** 1 — At registration. The offer is the reason to open the app today. */
export function welcomeTrial(userId: string, name: string | null): Message {
  const url = trialUrl(userId);
  const first = firstName(name);
  return {
    subject: first ? `${first}, il tuo inglese parte adesso — 24 ore gratis` : "Il tuo inglese parte adesso — 24 ore gratis",
    html: renderEmail({
      preheader: "Attiva 24 ore di ExecLingo completo. E se completi il percorso del primo giorno, te ne regaliamo altre 24.",
      heading: `Benvenuto${first ? " " + first : ""}. Il tuo coach è già pronto.`,
      bodyHtml: `<p style="${P}">Hai creato il tuo account <strong>ExecLingo</strong>. Sam — il tuo coach — sa già parlare con te: chat, voce, riunioni simulate, English Rescue quando ti blocchi davanti a un cliente.</p>
        <p style="${P}">🎁 <strong>Ti apriamo tutto per 24 ore, gratis.</strong> Nessuna carta, nessun impegno: un clic qui sotto e il tuo assaggio parte.</p>
        <p style="${P}">⏳ E c'è di più: se <strong>entro quelle 24 ore</strong> rispondi alle tre domande del percorso e fai <strong>almeno 10 minuti</strong> di pratica, ti regaliamo <strong>altre 24 ore</strong>. Due giorni interi per capire se l'inglese può davvero smettere di essere un problema. Dopo, se vorrai continuare, si passa all'abbonamento.</p>
        <p style="${SMALL}">🏢 La tua azienda ti ha dato un codice? Inseriscilo in Profilo → Abbonamento e non serve altro.</p>`,
      ctaLabel: "🎁 Attiva le mie 24 ore gratis",
      ctaUrl: url,
      footerNote: "Hai ricevuto questa email perché ti sei appena registrato a ExecLingo.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `Benvenuto${first ? " " + first : ""}.\n\nTi apriamo ExecLingo per 24 ore, gratis. Nessuna carta, nessun impegno:\n${url}\n\nE se entro quelle 24 ore rispondi alle tre domande del percorso e fai almeno 10 minuti di pratica, ti regaliamo altre 24 ore. Dopo, se vorrai continuare, si passa all'abbonamento.\n\nHai un codice aziendale? Profilo → Abbonamento.\n\nExecLingo · un servizio VASP ITALIA SRL\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 2 — Trial running out and the modules not done. One reminder, not three. */
export function trialReminder(userId: string, name: string | null, hours: number): Message {
  const url = `${appBase()}/home`;
  return {
    subject: `Ti restano ${hours} ore di ExecLingo completo`,
    html: renderEmail({
      preheader: "Tre domande e dieci minuti: bastano a raddoppiare il tuo tempo gratis.",
      heading: `${hello(name)}mancano ${hours} ore.`,
      bodyHtml: `<p style="${P}">Il tuo accesso completo a Sam è ancora aperto, ma non per molto.</p>
        <p style="${P}">✅ Rispondi alle <strong>tre domande</strong> del percorso (30 secondi) e fai <strong>10 minuti</strong> di pratica: il tuo tempo gratis <strong>raddoppia</strong>, altre 24 ore, senza pagare nulla.</p>
        <p style="${SMALL}">Dieci minuti sono una call in metropolitana, o la coda alla cassa. È esattamente così che si impara: poco, ma tutti i giorni.</p>`,
      ctaLabel: "Continua da dove eri",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché hai attivato le tue 24 ore gratuite di ExecLingo.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}mancano ${hours} ore del tuo accesso completo.\n\nRispondi alle tre domande del percorso e fai 10 minuti di pratica: il tuo tempo gratis raddoppia, altre 24 ore.\n\n${url}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 3 — Earned. Say plainly what happens after, so nobody feels tricked. */
export function trialExtended(userId: string, name: string | null): Message {
  const url = `${appBase()}/home`;
  return {
    subject: "Fatto! Altre 24 ore gratis sono tue 🎁",
    html: renderEmail({
      preheader: "Hai completato il percorso del primo giorno. Il tuo accesso continua per altre 24 ore.",
      heading: `${hello(name)}te le sei guadagnate.`,
      bodyHtml: `<p style="${P}">Hai risposto alle domande e ti sei allenato davvero. Come promesso: <strong>altre 24 ore</strong> di ExecLingo completo, da adesso.</p>
        <p style="${P}">Usale bene — e già che ci sei, prova la cosa che quasi nessuno prova il primo giorno: <strong>parlare a voce con Sam</strong>. È lì che si rompe il blocco.</p>
        <p style="${SMALL}">Poi? Alla fine di queste 24 ore l'accesso si chiude e si passa all'abbonamento. Nessuna sorpresa, nessun addebito automatico: sarai tu a decidere se continuare.</p>`,
      ctaLabel: "Vai da Sam",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché hai completato il percorso del primo giorno.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}te le sei guadagnate.\n\nAltre 24 ore di ExecLingo completo, da adesso. Prova a parlare a voce con Sam: è lì che si rompe il blocco.\n\n${url}\n\nAlla fine di queste 24 ore l'accesso si chiude e si passa all'abbonamento: nessun addebito automatico, decidi tu.\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 4 — Trial over. The only email in the set whose job is to sell. */
export function trialEnded(userId: string, name: string | null): Message {
  const url = `${appBase()}/abbonamento`;
  return {
    subject: "Com'è andata? Ecco come continuare",
    html: renderEmail({
      preheader: "Il tuo assaggio è finito. Il percorso di 3 mesi è dove l'inglese diventa davvero tuo.",
      heading: `${hello(name)}il tuo assaggio finisce qui.`,
      bodyHtml: `<p style="${P}">Hai visto come lavora Sam. Adesso la domanda vera: tra tre mesi vuoi ancora rimandare quella call in inglese, o vuoi condurla tu?</p>
        <p style="${P}">Il <strong>Programma 3 mesi (99,90 € una volta, IVA inclusa)</strong> è il percorso completo: da dove sei oggi a operativo, con i progressi misurati su capacità reali — riunioni, numeri, trattativa, trasferte. In alternativa c'è il mensile, senza vincoli.</p>
        <p style="${SMALL}">Si attiva dal sito in due minuti e l'app sul telefono si sblocca da sola, con lo stesso account.</p>`,
      ctaLabel: "Scegli il tuo piano",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché il tuo periodo gratuito di ExecLingo è terminato.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}il tuo assaggio finisce qui.\n\nProgramma 3 mesi: 99,90 € una volta, IVA inclusa — il percorso completo verso l'inglese operativo. In alternativa il mensile, senza vincoli.\n\n${url}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 5 — Three days of silence. Warm, not scolding: guilt does not teach. */
export function comeBack(userId: string, name: string | null, days: number): Message {
  const url = `${appBase()}/home`;
  return {
    subject: "Sam ti aspetta ancora 👋",
    html: renderEmail({
      preheader: "Tre giorni senza inglese non cancellano niente. Cinque minuti oggi lo rimettono in moto.",
      heading: `${hello(name)}tutto bene?`,
      bodyHtml: `<p style="${P}">Sono ${days} giorni che non ci sentiamo. Nessun rimprovero — succede a tutti, e la settimana lavorativa è quella che è.</p>
        <p style="${P}">Solo una cosa vale la pena ricordare: l'inglese non si perde in tre giorni, <strong>si perde in tre mesi di rinvii</strong>. E si riprende in <strong>cinque minuti</strong>, oggi, da dove eri.</p>
        <p style="${SMALL}">Sam si ricorda di te: il tuo livello, i tuoi errori ricorrenti, le espressioni che stavi imparando. Non devi ricominciare da capo.</p>`,
      ctaLabel: "Riprendo in 5 minuti",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché hai un account ExecLingo e non lo usi da qualche giorno.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}tutto bene?\n\nSono ${days} giorni che non ci sentiamo. L'inglese non si perde in tre giorni, si perde in tre mesi di rinvii. E si riprende in cinque minuti.\n\nSam si ricorda di te: livello, errori ricorrenti, espressioni in corso. Non ricominci da capo.\n\n${url}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 6 — The evening after a real session. Praise the act, name the next one. */
export function eveningRecap(
  userId: string,
  name: string | null,
  stats: { minutes: number; streak: number; expressions: number }
): Message {
  const url = `${appBase()}/progress`;
  const streakLine =
    stats.streak >= 2
      ? `<p style="${P}">🔥 <strong>${stats.streak} giorni di fila.</strong> Questa è la parte che conta: non la giornata buona, la catena.</p>`
      : `<p style="${P}">Domani è il giorno che decide tutto: due giorni di fila valgono più di una domenica intera.</p>`;
  return {
    subject: `${stats.minutes} minuti di inglese oggi 👏`,
    html: renderEmail({
      preheader: `Oggi hai parlato inglese per ${stats.minutes} minuti. Ecco cosa ti porti a casa.`,
      heading: `${hello(name)}oggi hai fatto sul serio.`,
      bodyHtml: `<p style="${P}">⏱️ <strong>${stats.minutes} minuti</strong> di inglese vero — non di teoria, di conversazione.</p>
        ${stats.expressions > 0 ? `<p style="${P}">🧠 <strong>${stats.expressions} espressioni</strong> ripassate: sono quelle che Sam ti riproporrà quando stanno per sfuggirti.</p>` : ""}
        ${streakLine}
        <p style="${SMALL}">Domani ti basta lo stesso identico gesto: apri, e parla per cinque minuti. È tutto qui il metodo.</p>`,
      ctaLabel: "Guarda i tuoi progressi",
      ctaUrl: url,
      footerNote: "Ricevi questa email la sera dei giorni in cui ti sei allenato.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}oggi hai fatto sul serio.\n\n${stats.minutes} minuti di inglese vero.${stats.expressions ? `\n${stats.expressions} espressioni ripassate.` : ""}${stats.streak >= 2 ? `\n${stats.streak} giorni di fila.` : ""}\n\nDomani lo stesso gesto: apri e parla per cinque minuti.\n\n${url}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 7 — Whatever the owner writes from /admin, in the same envelope. */
export function broadcast(userId: string, name: string | null, subject: string, paragraphs: string[], cta?: { label: string; url: string }): Message {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = paragraphs.map((line) => `<p style="${P}">${escape(line)}</p>`).join("");
  return {
    subject,
    html: renderEmail({
      preheader: paragraphs[0]?.slice(0, 140) ?? subject,
      heading: `${hello(name)}${subject}`,
      bodyHtml: body,
      ctaLabel: cta?.label,
      ctaUrl: cta?.url,
      footerNote: "Ricevi questa email perché hai un account ExecLingo.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${paragraphs.join("\n\n")}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}
