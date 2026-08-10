/**
 * Production Marketing Kit: 6 launch campaigns with ready-to-post copy.
 * [LINK] is replaced with the partner's personal tracked referral URL.
 */

export type Campaign = {
  id: string;
  title: string;
  headline: string;
  sub: string;
  igCopy: string;
  liCopy: string;
  waCopy: string;
  /** Official photographic creatives (static, ready to post as-is). */
  photos?: { src: string; label: string }[];
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "business-english",
    title: "Business English",
    headline: "Parla inglese nel lavoro, anche se hai poco tempo.",
    sub: "Il coach AI per manager, professionisti e imprenditori.",
    igCopy:
      "Se hai poco tempo ma vuoi migliorare il tuo inglese per il lavoro, prova ExecLingo.\n\nÈ un AI English Coach pensato per manager, professionisti e imprenditori: si adatta al tempo che hai, anche pochi minuti alla volta.\n\nProvalo qui:\n[LINK]",
    liCopy:
      "L'inglese professionale non richiede ore di studio ogni giorno.\n\nExecLingo è progettato per manager, professionisti e imprenditori che vogliono integrare l'inglese nella propria giornata: micro-sessioni, simulazioni di meeting, conversazioni vocali con un coach AI e un percorso adattivo orientato al business.\n\nScopri ExecLingo:\n[LINK]",
    waCopy:
      "Ti giro questa app perché secondo me può esserti utile. Si chiama ExecLingo ed è pensata per chi vuole migliorare l'inglese per lavoro ma ha poco tempo. La usi anche 2 minuti alla volta e il coach si adatta a te. Se vuoi provarla: [LINK]",
  },
  {
    id: "percorso-3-mesi",
    title: "3-Month Executive Path",
    headline: "Costruisci il tuo inglese professionale in 3 mesi.",
    sub: "Un percorso, un coach AI, capacità reali.",
    igCopy:
      "3 mesi. Un percorso. Un coach AI personale.\n\nExecLingo ti accompagna da dove sei fino all'inglese operativo per riunioni, call e trasferte — con micro-sessioni su misura del tuo tempo.\n\nInizia il tuo percorso:\n[LINK]",
    liCopy:
      "Un percorso di 3 mesi verso l'inglese professionale.\n\nExecLingo combina coaching AI personalizzato, micro-sessioni quotidiane e contenuti business reali (meeting, negoziazioni, presentazioni). I progressi non sono voti: sono capacità dimostrate.\n\nScopri il 3-Month Executive Path:\n[LINK]",
    waCopy:
      "Sto seguendo/consigliando ExecLingo: un percorso di 3 mesi con un coach AI per arrivare all'inglese da lavoro. Si adatta al tuo livello e al tuo tempo. Dai un'occhiata: [LINK]",
  },
  {
    id: "poco-tempo",
    title: "Per chi ha poco tempo",
    headline: "2 minuti. 5 minuti. 20 minuti. Si adatta a te.",
    sub: "L'inglese nei ritagli veri della tua giornata.",
    igCopy:
      "2 minuti in taxi. 5 tra due riunioni. 20 la sera.\n\nExecLingo si adatta al tempo che hai davvero: scegli i minuti, il coach fa il resto.\n\nProva gratis:\n[LINK]",
    liCopy:
      "Il problema dell'inglese non è la difficoltà: è il tempo.\n\nExecLingo è costruito attorno alle agende piene: sessioni da 2, 5 o 20 minuti, notifiche intelligenti nei momenti giusti della giornata, e un coach AI che riprende esattamente da dove avevi lasciato.\n\n[LINK]",
    waCopy:
      "Questa app è furba: ti alleni in inglese anche solo 2 minuti alla volta, quando puoi. Perfetta se hai giornate piene. Provala: [LINK]",
  },
  {
    id: "call-meeting",
    title: "Call & Meeting",
    headline: "Preparati a call e meeting internazionali.",
    sub: "Riunioni, presentazioni, negoziazioni, finanza.",
    igCopy:
      "Hai una call in inglese tra poco?\n\nExecLingo ha il Meeting Warm-up: 5 minuti di riscaldamento mirato con le frasi che ti serviranno davvero. E simulazioni di riunioni, trattative e presentazioni.\n\n[LINK]",
    liCopy:
      "La differenza tra subire una call in inglese e guidarla è la preparazione.\n\nExecLingo allena esattamente questo: simulazioni di meeting, negoziazioni, presentazioni e linguaggio finanziario, con un coach AI che corregge e adatta il livello. C'è anche il warm-up pre-call da 5 minuti.\n\n[LINK]",
    waCopy:
      "Se hai spesso call o riunioni in inglese, guarda ExecLingo: ha pure il 'riscaldamento' pre-meeting da 5 minuti con le frasi giuste. [LINK]",
    photos: [{ src: "/marketing/call-meeting.jpg", label: "Foto ufficiale" }],
  },
  {
    id: "listen-type",
    title: "Listen + Type",
    headline: "Ascolta in inglese. Rispondi anche solo scrivendo.",
    sub: "Perfetto in treno, in coda, in mezzo alla gente.",
    igCopy:
      "In treno? In coda? In ufficio open space?\n\nCon ExecLingo ti alleni anche senza parlare: ascolti in inglese e rispondi scrivendo. L'orecchio si allena, nessuno ti sente.\n\n[LINK]",
    liCopy:
      "Non sempre si può parlare ad alta voce — e non serve.\n\nLa modalità Listen + Type di ExecLingo allena la comprensione orale nei momenti 'silenziosi' della giornata: pendolarismo, attese, viaggi. Ascolti, scrivi, il coach corregge.\n\n[LINK]",
    waCopy:
      "C'è una modalità di ExecLingo perfetta per il treno: ascolti l'inglese e rispondi scrivendo, senza parlare. La uso nei tempi morti. [LINK]",
    photos: [{ src: "/marketing/listen-type.jpg", label: "Foto ufficiale" }],
  },
  {
    id: "business-travel",
    title: "Business + Travel",
    headline: "Un coach per il lavoro e per i tuoi viaggi.",
    sub: "Meeting all'estero, aeroporti, hotel, cene di lavoro.",
    igCopy:
      "Trasferta in vista?\n\nExecLingo ti prepara ai meeting all'estero ma anche ad aeroporti, hotel, ristoranti e networking. E se ti serve una frase ADESSO, c'è English Rescue: scrivi in italiano, la ottieni in inglese con l'audio.\n\n[LINK]",
    liCopy:
      "L'inglese di lavoro non finisce in sala riunioni: continua in aeroporto, in hotel, a cena con i clienti.\n\nExecLingo copre entrambi i mondi — business e viaggio — con un coach AI e una funzione 'salvavita' (English Rescue) per le frasi che servono al momento.\n\n[LINK]",
    waCopy:
      "Per chi viaggia per lavoro: ExecLingo ti prepara ai meeting ma anche a check-in, ristoranti e imprevisti. Ha una funzione che ti traduce al volo quello che vuoi dire, con l'audio. [LINK]",
    photos: [
      { src: "/marketing/business-travel.jpg", label: "Foto ufficiale 1" },
      { src: "/marketing/business-travel-donna.jpg", label: "Foto ufficiale 2" },
    ],
  },
];

export { CREATIVE_FORMATS as FORMATS } from "./creative";
