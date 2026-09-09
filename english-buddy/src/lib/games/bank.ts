import type { GameWord } from "./words";

/**
 * The fallback bank, for the player who has not made any mistakes yet — day
 * one, or the day after a clean session. Business English only: a game that
 * hands an executive "kitten" has broken the promise the rest of the app makes.
 *
 * Clues are in Italian and never contain the English word, and every entry
 * stays inside MIN_LETTERS..MAX_LETTERS — a longer word would not fit the
 * tray. tests/games.test.ts holds both rules.
 */
const BANK: { word: string; hint: string }[] = [
  { word: "agenda", hint: "L'elenco dei punti da trattare in riunione" },
  { word: "budget", hint: "Le risorse assegnate a un progetto per l'anno" },
  { word: "deadline", hint: "Il termine entro cui una consegna va fatta" },
  { word: "invoice", hint: "Il documento con cui chiedi di essere pagato" },
  { word: "meeting", hint: "L'incontro, in presenza o in call" },
  { word: "revenue", hint: "Il fatturato, prima dei costi" },
  { word: "forecast", hint: "La previsione di come andranno i numeri" },
  { word: "quarter", hint: "Uno dei quattro periodi in cui si divide l'anno fiscale" },
  { word: "target", hint: "L'obiettivo numerico da raggiungere" },
  { word: "supplier", hint: "Chi ti fornisce merce o servizi" },
  { word: "customer", hint: "Chi compra da te" },
  { word: "contract", hint: "L'accordo firmato tra due parti" },
  { word: "leverage", hint: "La forza contrattuale, o farne uso" },
  { word: "handover", hint: "Il passaggio di consegne a chi prende il tuo posto" },
  { word: "shortlist", hint: "L'elenco ristretto dei candidati finalisti" },
  { word: "feedback", hint: "Il ritorno che chiedi dopo aver presentato qualcosa" },
  { word: "briefing", hint: "L'incontro breve per allineare tutti prima di partire" },
  { word: "pipeline", hint: "Le trattative aperte, in ordine di avanzamento" },
  { word: "colleague", hint: "La persona con cui lavori, allo stesso livello" },
  { word: "audit", hint: "La verifica formale dei conti o delle procedure" },
  { word: "outsource", hint: "Affidare a un fornitore esterno un'attività interna" },
  { word: "workload", hint: "La quantità di lavoro che una persona ha addosso" },
  { word: "milestone", hint: "La tappa intermedia che segna un avanzamento" },
  { word: "rollout", hint: "Il lancio progressivo di qualcosa su tutti gli utenti" },
  { word: "turnover", hint: "Il ricambio delle persone che lasciano l'azienda" },
  { word: "trainee", hint: "Chi è appena entrato e sta ancora imparando il mestiere" },
  { word: "appraisal", hint: "La valutazione periodica di una persona" },
  { word: "headcount", hint: "Il numero di persone in organico" },
  { word: "overhead", hint: "I costi fissi di struttura, non legati alla produzione" },
  { word: "margin", hint: "Quello che resta tra prezzo e costo" },
  { word: "discount", hint: "La riduzione di prezzo concessa al cliente" },
  { word: "deliver", hint: "Consegnare quello che si è promesso" },
  { word: "negotiate", hint: "Trattare per arrivare a un accordo" },
  { word: "postpone", hint: "Spostare più avanti nel tempo" },
  { word: "approve", hint: "Dare il via libera formale" },
  { word: "attend", hint: "Partecipare a una riunione o a un evento" },
  { word: "commute", hint: "Il tragitto quotidiano tra casa e ufficio" },
  { word: "expense", hint: "La spesa che ti fai rimborsare dall'azienda" },
  { word: "receipt", hint: "Lo scontrino o la ricevuta da allegare" },
  { word: "schedule", hint: "Il calendario delle attività previste" },
  { word: "shipment", hint: "La merce spedita, in viaggio verso il cliente" },
  { word: "warehouse", hint: "Il magazzino dove sta la merce" },
  { word: "insurance", hint: "La copertura che paghi contro i rischi" },
  { word: "liability", hint: "La responsabilità di cui rispondi" },
  { word: "breakdown", hint: "Il dettaglio voce per voce di un totale" },
  { word: "highlight", hint: "Mettere in evidenza il punto che conta" },
  { word: "outcome", hint: "Il risultato finale di un processo" },
  { word: "agreement", hint: "L'intesa raggiunta tra le parti" },
  { word: "proposal", hint: "L'offerta che presenti al cliente" },
  { word: "reminder", hint: "Il sollecito gentile a chi non ha risposto" },
];

/** Bank words, in a rotation that does not start from "agenda" every time. */
export function bankWords(count: number, seed: number): GameWord[] {
  const start = ((seed % BANK.length) + BANK.length) % BANK.length;
  const out: GameWord[] = [];
  for (let i = 0; i < Math.min(count, BANK.length); i += 1) {
    const entry = BANK[(start + i) % BANK.length];
    out.push({ word: entry.word, hint: entry.hint, source: "bank", itemText: null });
  }
  return out;
}

export const BANK_SIZE = BANK.length;
