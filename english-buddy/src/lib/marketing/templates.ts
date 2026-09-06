import { renderEmail } from "@/lib/email";
import type { Message } from "./send";
import { appBase, trialUrl, unsubscribeUrl } from "./tokens";
import type { WinBackStep } from "./winback";

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
        <p style="${P}">Se c'è una cosa da provare prima che finisca, è <strong>parlare a voce con Sam</strong>: è il pezzo che quasi nessuno prova, ed è quello che rompe il blocco davanti a una call vera.</p>
        <p style="${SMALL}">Quando la settimana finisce non ti viene addebitato nulla: l'accesso si chiude e basta. Il tuo livello, il frasario e gli errori su cui stai lavorando restano dove sono.</p>`,
      ctaLabel: "Continua da dove eri",
      ctaUrl: url,
      footerNote: "Ricevi questa email perché la tua settimana gratuita di ExecLingo sta per finire.",
      unsubscribeUrl: unsubscribeUrl(userId),
    }),
    text: `${hello(name)}${days === 1 ? "manca un giorno" : `mancano ${days} giorni`} del tuo accesso completo.\n\nSe c'è una cosa da provare prima che finisca, è parlare a voce con Sam.\n\n${url}\n\nQuando finisce non ti viene addebitato nulla, e i tuoi progressi restano.\n\nDisiscriviti: ${unsubscribeUrl(userId)}`,
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
 * 5 — The win-back ladder. One function, four voices.
 *
 * The tone hardens on purpose as the silence lengthens, because the same
 * gentle sentence repeated for six weeks stops meaning anything. What none of
 * them do is blame: guilt does not teach a language, and somebody who feels
 * told off does not open the next one either.
 */
export function winBack(
  userId: string,
  name: string | null,
  step: WinBackStep,
  days: number
): Message {
  const url = `${appBase()}/home`;
  const out = unsubscribeUrl(userId);
  const foot = (note: string) => ({ footerNote: note, unsubscribeUrl: out });

  if (step.stage === "soft") {
    return {
      subject: "Tutto bene?",
      html: renderEmail({
        preheader: "Tre giorni non cancellano niente. Cinque minuti oggi rimettono tutto in moto.",
        heading: `${hello(name)}tutto bene?`,
        bodyHtml: `<p style="${P}">Sono ${days} giorni che non ci sentiamo. Nessun rimprovero — la settimana lavorativa è quella che è, succede a tutti.</p>
          <p style="${P}">Solo una cosa vale la pena ricordare: l&rsquo;inglese non si perde in tre giorni, <strong>si perde in tre mesi di rinvii</strong>. E si riprende in <strong>cinque minuti</strong>, oggi, da dove eri.</p>
          <p style="${SMALL}">Sam si ricorda di te: il tuo livello, i tuoi errori ricorrenti, le espressioni che stavi imparando. Non devi ricominciare da capo.</p>`,
        ctaLabel: "Riprendo in 5 minuti",
        ctaUrl: url,
        ...foot("Ricevi questa email perché non apri ExecLingo da qualche giorno."),
      }),
      text: `${hello(name)}tutto bene?\n\nSono ${days} giorni che non ci sentiamo. L'inglese non si perde in tre giorni, si perde in tre mesi di rinvii. E si riprende in cinque minuti.\n\n${url}\n\nDisiscriviti: ${out}`,
    };
  }

  if (step.stage === "firm") {
    return {
      subject: "Una settimana senza inglese",
      html: renderEmail({
        preheader: "Non è l'inglese che si perde in una settimana. È l'abitudine — ed è quella che vale.",
        heading: `${hello(name)}parliamoci chiaro.`,
        bodyHtml: `<p style="${P}">È passata <strong>una settimana</strong>. In una settimana non si dimentica l&rsquo;inglese: si perde l&rsquo;abitudine. Ed è l&rsquo;abitudine la cosa difficile da costruire — le parole tornano da sole, il ritmo no.</p>
          <p style="${P}">Ti eri iscritto per una ragione precisa: una call, una riunione, un cliente, un colloquio. <strong>Quella ragione è ancora lì.</strong> Non se n&rsquo;è andata perché questa settimana è stata piena.</p>
          <p style="${P}">Non ti serve un&rsquo;ora. Ti servono <strong>cinque minuti oggi</strong> e cinque domani. È letteralmente tutto il metodo.</p>
          <p style="${SMALL}">Sam riparte esattamente da dove vi eravate lasciati.</p>`,
        ctaLabel: "Riprendo adesso",
        ctaUrl: url,
        ...foot("Ricevi questa email perché non apri ExecLingo da una settimana."),
      }),
      text: `${hello(name)}parliamoci chiaro.\n\nÈ passata una settimana. Non si dimentica l'inglese in sette giorni: si perde l'abitudine, ed è quella la parte difficile.\n\nTi eri iscritto per una ragione precisa. Quella ragione è ancora lì.\n\nCinque minuti oggi, cinque domani: ${url}\n\nDisiscriviti: ${out}`,
    };
  }

  if (step.stage === "hard") {
    return {
      subject: "Due settimane. Te lo dico onestamente.",
      html: renderEmail({
        preheader: "A questo punto o riprendi oggi, o questo diventa un altro proposito lasciato a metà.",
        heading: `${hello(name)}ti dico la verità.`,
        bodyHtml: `<p style="${P}">Sono <strong>${days} giorni</strong>. A questo punto so come va a finire, perché va così quasi sempre: o si riprende <em>oggi</em>, o questo resta l&rsquo;ennesimo proposito lasciato a metà — insieme al corso comprato e mai finito, e all&rsquo;abbonamento in palestra di gennaio.</p>
          <p style="${P}">Non è una colpa. È che l&rsquo;inglese non è mai <strong>urgente</strong> finché non lo diventa tutto insieme: la call che non puoi rimandare, il cliente che passa all&rsquo;inglese, la riunione dove sai cosa dire e non sai come dirlo.</p>
          <p style="${P}">Il tuo percorso è ancora lì, intatto, con il tuo livello e i tuoi errori. <strong>Cinque minuti.</strong> Se dopo averli fatti pensi ancora che non faccia per te, disiscriviti in fondo a questa email e non ti scrivo più — davvero, senza rancore.</p>`,
        ctaLabel: "Va bene, cinque minuti",
        ctaUrl: url,
        ...foot("Ricevi questa email perché non apri ExecLingo da due settimane."),
      }),
      text: `${hello(name)}ti dico la verità.\n\nSono ${days} giorni. O si riprende oggi, o questo resta l'ennesimo proposito lasciato a metà.\n\nL'inglese non è mai urgente finché non lo diventa tutto insieme: la call che non puoi rimandare, il cliente che passa all'inglese.\n\nCinque minuti: ${url}\n\nSe dopo pensi che non faccia per te, disiscriviti qui e non ti scrivo più: ${out}`,
    };
  }

  // The reminders. Short by design — at this distance a long letter is not
  // read, and the variations exist so six of them do not read as one robot
  // repeating itself.
  const lines = [
    { subject: "Cinque minuti?", body: "Nessun discorso. Solo la domanda: cinque minuti di inglese, oggi?" },
    { subject: "La tua call in inglese, quando arriva", body: "Arriverà con due giorni di preavviso e nessun tempo per prepararsi. È l'unico motivo per cui vale la pena farlo adesso che non serve." },
    { subject: "Sam si ricorda ancora di te", body: "Il tuo livello, i tuoi errori, le espressioni che stavi imparando: è tutto lì. Non si è cancellato niente." },
    { subject: "Un minuto, allora", body: "Se cinque sono troppi: uno. Una domanda, una risposta in inglese, e hai finito. È già meglio di zero." },
    { subject: "L'inglese di chi lo parla male", body: "Non è chi ha studiato di più. È chi si è esposto di più — sbagliando, davanti a qualcuno. Sam è il posto dove farlo senza pubblico." },
    { subject: "Ultimo promemoria", body: "Questo è l'ultimo che ti mando: dopo smetto, e resta solo l'app se un giorno ti va. Nessun rancore, e la porta resta aperta." },
  ];
  const pick = lines[Math.min(step.index - 1, lines.length - 1)] ?? lines[0];
  const last = step.index >= lines.length;
  return {
    subject: pick.subject,
    html: renderEmail({
      preheader: pick.body.slice(0, 130),
      heading: pick.subject,
      bodyHtml: `<p style="${P}">${pick.body}</p>${last ? "" : `<p style="${SMALL}">Se non è il momento, va bene così — basta che non diventi mai il momento.</p>`}`,
      ctaLabel: "Apri ExecLingo",
      ctaUrl: url,
      ...foot(last ? "È l'ultimo promemoria di questa serie: dopo non ti scriviamo più." : "Ricevi questa email perché non apri ExecLingo da un po'."),
    }),
    text: `${pick.body}\n\n${url}\n\nDisiscriviti: ${out}`,
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
