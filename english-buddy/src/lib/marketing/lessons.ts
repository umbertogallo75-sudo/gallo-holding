/**
 * The phrases the letters are built around.
 *
 * The rule that produced this file, from the second tester report: every
 * message has to be worth opening on its own. An email whose whole content is
 * "torna nell'app" is a debt collector — it asks for something and gives
 * nothing, and the second one is deleted unread.
 *
 * So each letter teaches one phrase. Not vocabulary: the sentence somebody
 * actually needs in the room, the one that is hard to invent under pressure
 * because the Italian version does not translate word for word. Somebody who
 * reads it and never opens the app has still been taught something, which is
 * the only honest reason to be in their inbox.
 */
export type Lesson = {
  /** The English, as it would be said. */
  en: string;
  /** Not a translation: when you would reach for it, and what it does. */
  it: string;
  /** The situation, three or four words, for the subject line. */
  when: string;
};

export const LESSONS: Lesson[] = [
  {
    en: "Let me come back to you on that.",
    it: "Quando non hai la risposta e non vuoi inventarla. In inglese «I don't know» chiude il discorso e ti fa sembrare impreparato; questa dice la stessa cosa e ti lascia in controllo.",
    when: "Non hai la risposta",
  },
  {
    en: "Sorry, could you slow down a little? I want to get this right.",
    it: "Chiedere di rallentare senza scusarti di esistere. La seconda metà è tutto: non stai ammettendo di non capire, stai dicendo che quello che dicono ti interessa abbastanza da volerlo preciso.",
    when: "Parlano troppo veloce",
  },
  {
    en: "Just to make sure I've understood: you need it by Friday, correct?",
    it: "La frase che salva le riunioni. Ricapitoli con parole tue, e se avevi capito male lo scopri adesso invece che tra due settimane.",
    when: "Hai capito a metà",
  },
  {
    en: "That's not something we can do at that price.",
    it: "Dire no senza chiudere la porta. Non è «no», è «non a queste condizioni» — e lascia all'altro il compito di trovare le condizioni giuste.",
    when: "Ti chiedono uno sconto",
  },
  {
    en: "We're looking at around three hundred thousand, give or take.",
    it: "I numeri approssimati, che in riunione sono quasi tutti. «Give or take» è il nostro «più o meno» e in inglese si mette in fondo, non davanti.",
    when: "Dici una cifra",
  },
  {
    en: "Can I jump in here?",
    it: "Interrompere in call senza sembrare maleducato. Tre parole, e sono quelle che gli inglesi usano davvero: «Excuse me» suona come se stessi fermando qualcuno per strada.",
    when: "Devi interrompere",
  },
  {
    en: "It's not a no — it's a not yet.",
    it: "Tenere viva una trattativa che sta scivolando. Dice all'altro che c'è ancora una strada, senza promettere niente.",
    when: "La trattativa si blocca",
  },
  {
    en: "Let's park that for now and come back to it.",
    it: "Togliere dal tavolo il punto che sta mangiando la riunione, senza dire a nessuno che il suo argomento non conta.",
    when: "La riunione si impantana",
  },
  {
    en: "What would it take to get this done by the end of the month?",
    it: "La domanda che sblocca. Non chiedi se si può fare — chiedi cosa serve perché si faccia, e l'altro si ritrova a costruire la soluzione al posto tuo.",
    when: "Vuoi una data",
  },
  {
    en: "I'll be straight with you.",
    it: "Si mette prima della cosa scomoda. Avvisa che stai per essere diretto, e così la franchezza diventa rispetto invece che aggressione.",
    when: "Devi dire una cosa scomoda",
  },
  {
    en: "Bear with me a second.",
    it: "Per prendere tempo mentre cerchi le parole — che è esattamente il momento in cui di solito ci si scusa troppo. Questa non si scusa: chiede pazienza, e la ottiene.",
    when: "Ti serve un secondo",
  },
  {
    en: "Let's keep it high level for now.",
    it: "Per restare sulle grandi linee quando qualcuno ti sta trascinando in dettagli che in inglese non reggeresti. Utile, e anche onesta.",
    when: "Il dettaglio ti frega",
  },
];

/** The phrase for the nth letter, cycling rather than running out. */
export function lessonAt(index: number): Lesson {
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return LESSONS[safe % LESSONS.length];
}
