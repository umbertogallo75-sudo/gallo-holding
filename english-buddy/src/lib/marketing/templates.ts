import { renderEmail } from "@/lib/email";
import type { Message } from "./send";
import { appBase, trialUrl, unsubscribeUrl } from "./tokens";
import { MAX_REMINDERS, type WinBackStep } from "./winback";
import { lessonAt } from "./lessons";

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
    subject: first ? `${first}, il tuo accesso a ExecLingo è pronto` : "Il tuo accesso a ExecLingo è pronto",
    html: renderEmail({
      preheader: "La tua settimana gratis è già attiva: sette giorni con tutto aperto, senza carta.",
      heading: `Benvenuto${first ? " " + first : ""}. La tua settimana è già partita.`,
      bodyHtml: `<p style="${P}">Hai creato il tuo account <strong>ExecLingo</strong>. Sam — il tuo coach — sa già parlare con te: chat, voce, riunioni simulate, English Rescue quando ti blocchi davanti a un cliente.</p>
        <p style="${P}"><strong>La prima settimana è gratis, e non devi attivare niente:</strong> sette giorni con tutto aperto sono già partiti nel momento in cui ti sei registrato. Nessuna carta, nessun impegno.</p>
        <p style="${P}">Quando la settimana finisce, l'accesso si chiude — <strong>ma quello che hai fatto resta tuo</strong>: il tuo livello, il frasario e gli errori su cui stavi lavorando ti aspettano. Se deciderai di continuare, riprendi esattamente da lì.</p>
        <p style="${SMALL}">La tua azienda ti ha dato un codice? Inseriscilo in Profilo → Abbonamento e non serve altro.</p>`,
      ctaLabel: "Comincia adesso",
      ctaUrl: url,
      footerNote: "Hai ricevuto questa email perché ti sei appena registrato a ExecLingo.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `Benvenuto${first ? " " + first : ""}.\n\nLa prima settimana è gratis e non devi attivare niente: sette giorni con tutto aperto sono gia' partiti.\n${url}\n\nQuando finisce, l'accesso si chiude ma i tuoi progressi restano: livello, frasario ed errori su cui stavi lavorando ti aspettano.\n\nHai un codice aziendale? Profilo -> Abbonamento.\n\nExecLingo · un servizio VASP ITALIA SRL\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 2 — The week is nearly over. One reminder, not three. */
export function trialReminder(userId: string, name: string | null, days: number): Message {
  const url = `${appBase()}/home`;
  const left = days === 1 ? "un giorno" : `${days} giorni`;
  return {
    subject: `Ti ${days === 1 ? "resta" : "restano"} ${left} di accesso completo`,
    html: renderEmail({
      preheader: "La settimana gratis sta per finire. I tuoi progressi restano comunque tuoi.",
      heading: `${hello(name)}${days === 1 ? "manca un giorno" : `mancano ${days} giorni`}.`,
      bodyHtml: `<p style="${P}">Il tuo accesso completo a Sam è ancora aperto, ma non per molto.</p>
        <p style="${P}">Se c'è una cosa da provare prima che finisca, è <strong>parlare a voce con Sam</strong>: è il pezzo che quasi nessuno prova, ed è quello che rompe il blocco davanti a una call vera. Portaci questa, tanto per avere una frase in tasca:</p>
        <p style="margin:0 0 12px;padding:14px 16px;border-left:3px solid #c9d4c6;background:#f4f7f3;font-size:17px;line-height:1.5;color:#2f3a30;"><strong>${lessonAt(1).en}</strong></p>
        <p style="${P}">${lessonAt(1).it}</p>
        <p style="${SMALL}">Quando la settimana finisce non ti viene addebitato nulla: l'accesso si chiude e basta. Il tuo livello, il frasario e gli errori su cui stai lavorando restano dove sono.</p>`,
      ctaLabel: "Continua da dove eri",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché la tua settimana gratuita di ExecLingo sta per finire.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}${days === 1 ? "manca un giorno" : `mancano ${days} giorni`} del tuo accesso completo.\n\nSe c'è una cosa da provare prima che finisca, è parlare a voce con Sam. Una frase da portarci:\n\n  ${lessonAt(1).en}\n\n${lessonAt(1).it}\n\n${url}\n\nQuando finisce non ti viene addebitato nulla, e i tuoi progressi restano.\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/** 3 — The week is over. The only email in the set whose job is to sell. */
/* (was 4) The only email in the set whose job is to sell. */
export function trialEnded(userId: string, name: string | null): Message {
  const url = `${appBase()}/abbonamento`;
  return {
    subject: "Com'è andata? Ecco come continuare",
    html: renderEmail({
      preheader: "Il tuo assaggio è finito. Il percorso di 3 mesi è dove l'inglese diventa davvero tuo.",
      heading: `${hello(name)}il tuo assaggio finisce qui.`,
      bodyHtml: `<p style="${P}">Hai visto come lavora Sam. Adesso la domanda vera: tra tre mesi vuoi ancora rimandare quella call in inglese, o vuoi condurla tu?</p>
        <p style="${P}">Il <strong>Programma 3 mesi (99,90 € una volta, IVA inclusa)</strong> è il percorso completo: da dove sei oggi a operativo, con i progressi misurati su capacità reali — riunioni, numeri, trattativa, trasferte. Per dodici mesi con Sam c&rsquo;è l&rsquo;<strong>Annuale a 199,00 €</strong>; resta disponibile anche il mensile senza vincoli.</p>
        <p style="${P}"><strong>Quello che hai costruito è ancora lì.</strong> Il tuo livello, il frasario che ti sei fatto e gli errori su cui stavi lavorando non sono stati cancellati: nel momento in cui riattivi, riprendi da quel punto e non da capo.</p>
        <p style="${SMALL}">Si attiva dal sito in due minuti e l'app sul telefono si sblocca da sola, con lo stesso account.</p>`,
      ctaLabel: "Scegli il tuo piano",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché il tuo periodo gratuito di ExecLingo è terminato.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}il tuo assaggio finisce qui.\n\nProgramma 3 mesi: 99,90 € una volta, IVA inclusa — il percorso completo verso l'inglese operativo. Per dodici mesi con Sam c'è l'Annuale a 199,00 €; resta disponibile anche il mensile senza vincoli.\n\n${url}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}

/**
 * 5 — The letters that go out when somebody stops coming.
 *
 * They used to be a pressure ladder: a hand on the shoulder, then "parliamoci
 * chiaro", then the abandoned gym membership. The testers read all three and
 * the verdict was the same each time — it makes you feel judged, and nobody
 * opens the next one. They were right, and not only about the tone: those
 * letters gave nothing. Every one of them asked for something and taught
 * nothing, which is a debt collector's letter, not a coach's.
 *
 * So each one now carries a phrase. One sentence of real English, what it
 * does and when you would reach for it. Somebody who reads it on the train
 * and never opens the app has still learnt something, and that is the point:
 * it is the only thing that earns the next email. The silence gets one line,
 * factual, and never a reproach.
 */
export function winBack(
  userId: string,
  name: string | null,
  step: WinBackStep,
  days: number
): Message {
  const url = `${appBase()}/home`;
  const out = unsubscribeUrl(userId);
  // Where this letter sits in the sequence, so the phrases do not repeat.
  const ordinal = step.stage === "soft" ? 0 : step.stage === "firm" ? 1 : step.stage === "hard" ? 2 : 2 + step.index;
  const lesson = lessonAt(ordinal);
  const last = step.stage === "reminder" && step.index >= MAX_REMINDERS;

  // The one line about the silence. It says how long it has been and nothing
  // else: no "parliamoci chiaro", no diagnosis of their character.
  const gap =
    step.stage === "soft"
      ? `Sono ${days} giorni che non ci sentiamo — la settimana lavorativa è quella che è.`
      : step.stage === "firm"
        ? `Una settimana. Sam ha ancora il tuo livello, i tuoi errori e il tuo frasario dove li avevi lasciati.`
        : last
          ? `Questa è l'ultima che ti scrivo. Dopo resta solo l'app, se un giorno ti va.`
          : `Sono ${days} giorni. Nessun problema: il percorso ti aspetta al punto esatto in cui l'hai lasciato.`;

  return {
    subject: `Come si dice, quando ${lesson.when.toLowerCase()}`,
    html: renderEmail({
      preheader: lesson.en,
      heading: lesson.when,
      bodyHtml: `<p style="${P}">${gap}</p>
        <p style="${P}">Intanto, la frase di oggi — quella che in italiano viene da sola e in inglese no:</p>
        <p style="margin:0 0 12px;padding:14px 16px;border-left:3px solid #c9d4c6;background:#f4f7f3;font-size:17px;line-height:1.5;color:#2f3a30;"><strong>${lesson.en}</strong></p>
        <p style="${P}">${lesson.it}</p>
        <p style="${SMALL}">Dirla una volta vale più che leggerla dieci. Sam te la fa usare in due minuti, in una situazione tua.</p>`,
      ctaLabel: "Provala con Sam",
      ctaUrl: url,
      footerNote: last
        ? "È l'ultimo promemoria di questa serie: dopo non ti scriviamo più."
        : "Ricevi questa email perché non apri ExecLingo da qualche giorno.",
      unsubscribeUrl: out,
    }),
    text: `${gap}\n\nLa frase di oggi:\n\n  ${lesson.en}\n\n${lesson.it}\n\nProvala con Sam: ${url}\n\nDisiscriviti: ${out}`,
  };
}

/** 6 — The evening after a real session. Praise the act, name the next one. */
export function eveningRecap(
  userId: string,
  name: string | null,
  stats: { minutes: number; streak: number; expressions: number }
): Message {
  const url = `${appBase()}/percorso`;
  const streakLine =
    stats.streak >= 2
      ? `<p style="${P}"><strong>${stats.streak} giorni di fila.</strong> Questa è la parte che conta: non la giornata buona, la catena.</p>`
      : `<p style="${P}">Domani è il giorno che decide tutto: due giorni di fila valgono più di una domenica intera.</p>`;
  return {
    subject: `${stats.minutes} minuti di inglese oggi`,
    html: renderEmail({
      preheader: `Oggi hai parlato inglese per ${stats.minutes} minuti. Ecco cosa ti porti a casa.`,
      heading: `${hello(name)}oggi hai fatto sul serio.`,
      bodyHtml: `<p style="${P}"><strong>${stats.minutes} minuti</strong> di inglese vero — non di teoria, di conversazione.</p>
        ${stats.expressions > 0 ? `<p style="${P}"><strong>${stats.expressions} espressioni</strong> ripassate: sono quelle che Sam ti riproporrà quando stanno per sfuggirti.</p>` : ""}
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
  const first = firstName(name);
  return {
    subject,
    html: renderEmail({
      preheader: paragraphs[0]?.slice(0, 140) ?? subject,
      // The subject stands as the heading, and the greeting is its own line.
      // Gluing them together produced "Umberto, Cosa puoi farci" — a capital
      // after a comma, on every campaign, which reads as a mail merge that
      // nobody proofread.
      heading: subject,
      bodyHtml: `${first ? `<p style="${P}">Ciao ${escape(first)},</p>` : ""}${body}`,
      ctaLabel: cta?.label,
      ctaUrl: cta?.url,
      footerNote: "Ricevi questa email perché hai un account ExecLingo.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${paragraphs.join("\n\n")}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
  };
}
