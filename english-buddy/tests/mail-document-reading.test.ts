import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const process = readFileSync("src/lib/mail/process.ts", "utf8");
const detail = readFileSync("src/app/mail/[id]/MailDetail.tsx", "utf8");
const analyse = readFileSync("src/lib/documents/analyse.ts", "utf8");
const docPage = readFileSync("src/app/documenti/[id]/page.tsx", "utf8");

/**
 * Two testers, the same complaint in two places: they are shown what Sam made
 * of a text before being shown the text. "Un riassunto dell'email che non mi
 * aiuta a comprendere cosa realmente abbia scritto il mio interlocutore", and
 * for a document "non vedo il testo originale e non mi sento sicuro della
 * traduzione".
 */
describe("an email you can actually read", () => {
  it("translates the whole thing, not just a summary of it", () => {
    expect(process).toContain("translationIt");
    expect(process).toContain("IN FULL and faithfully");
    expect(process).toContain("no summarising");
  });

  it("translates the reply as well, because nobody sends what they cannot read", () => {
    expect(process).toContain("replyIt");
    expect(process).toContain("will not send a message they cannot read");
    expect(detail).toContain("Che in italiano dice");
  });

  it("shows the original first and open, not last and collapsed", () => {
    expect(detail).toContain("const [original, setOriginal] = useState(true)");
    const originalAt = detail.indexOf("Quello che ti hanno scritto");
    const summaryAt = detail.indexOf('{translation ? "In due righe" : "Cosa dice"}');
    const replyAt = detail.indexOf("La tua risposta");
    expect(originalAt).toBeGreaterThan(-1);
    expect(originalAt).toBeLessThan(summaryAt);
    expect(summaryAt).toBeLessThan(replyAt);
  });

  it("keeps working on emails answered before any of this existed", () => {
    // The two columns arrive with this change; an older item simply has no
    // translation, and the summary it does have is still shown.
    const store = readFileSync("src/lib/mail/store.ts", "utf8");
    expect(store).toContain("ALTER TABLE mail_items ADD COLUMN translation_it TEXT");
    expect(detail).toContain("{translation ? (");
  });
});

describe("a document you can check", () => {
  it("quotes the sentences that decide something, word for word", () => {
    // The file is never kept, so "show me the original" can only honestly mean
    // the lines that carry the money and the dates — and the English beside
    // the Italian is what makes the translation checkable.
    expect(analyse).toContain("copied VERBATIM from the document");
    expect(analyse).toContain("never paraphrase it");
    expect(docPage).toContain("I passaggi che contano");
    expect(docPage).toContain("docPassageEn");
  });

  it("holds the summary to the numbers", () => {
    expect(analyse).toContain("a number or a date reported wrongly here is worse than no summary at all");
  });

  it("gives each term the sentence it came from, so it is not a word floating alone", () => {
    expect(analyse).toContain("the words around it in the document");
    expect(docPage).toContain("term.context");
  });

  it("says what the questions are for, instead of listing them as filler", () => {
    expect(docPage).toContain("Le domande su cui ti alleni");
    expect(docPage).toContain("Sam te le farà davvero");
  });

  it("still opens a document analysed before passages existed", () => {
    expect(analyse).toContain(".default([])");
    expect(docPage).toContain("analysis.passages?.length");
  });
});
