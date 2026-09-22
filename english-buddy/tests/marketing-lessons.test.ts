import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LESSONS, lessonAt } from "@/lib/marketing/lessons";
import { winBack } from "@/lib/marketing/templates";
import { MAX_REMINDERS, winBackFor } from "@/lib/marketing/winback";

/**
 * What the second tester report said about these letters, in substance: they
 * make you feel judged, and they give you nothing. Both halves are tested
 * here, because fixing only the tone would leave an email that is polite and
 * still worth deleting unread.
 */
beforeEach(() => { process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long"; });
afterEach(() => { delete process.env.SESSION_SECRET; });

describe("the letters carry something", () => {
  it("teaches a phrase in every single one, whatever the stage", () => {
    const days = [3, 7, 15, 20, 25, 30, 35, 40, 45];
    const seen = new Set<string>();
    for (const day of days) {
      const step = winBackFor(day);
      expect(step, `nessuna lettera al giorno ${day}`).not.toBeNull();
      const message = winBack("u1", "Umberto", step!, day);
      const carries = LESSONS.some((lesson) => message.html.includes(lesson.en) && message.text.includes(lesson.en));
      expect(carries, `la lettera del giorno ${day} non insegna niente`).toBe(true);
      seen.add(message.subject);
    }
    // And not the same phrase nine times: six reminders that read as one robot
    // repeating itself is the other way to lose somebody.
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(days.length, LESSONS.length));
  });

  it("says how long it has been, and nothing about whose fault it is", () => {
    // The three lines the testers quoted back at us, gone from what is sent.
    const guilt = ["parliamoci chiaro", "palestra", "proposito lasciato a metà", "ti dico la verità", "so come va a finire"];
    for (const day of [3, 7, 15, 25, 45]) {
      const message = winBack("u1", "Umberto", winBackFor(day)!, day);
      const written = `${message.subject}\n${message.html}\n${message.text}`.toLowerCase();
      for (const line of guilt) expect(written, `${line} (giorno ${day})`).not.toContain(line);
    }
  });

  it("tells the last one it is the last one", () => {
    const step = winBackFor(15 + MAX_REMINDERS * 5)!;
    expect(step.stage).toBe("reminder");
    const message = winBack("u1", null, step, 45);
    expect(message.html).toContain("l'ultima che ti scrivo");
    expect(message.html).toContain("non ti scriviamo più");
  });

  it("keeps the phrases usable: English on one side, when to reach for it on the other", () => {
    for (const lesson of LESSONS) {
      expect(lesson.en.length).toBeGreaterThan(10);
      expect(lesson.it.length).toBeGreaterThan(40);
      expect(lesson.when.length).toBeLessThan(32);
      // A gloss that is only a translation teaches the words and not the move.
      expect(lesson.it).not.toBe(lesson.en);
    }
  });

  it("cycles rather than running out", () => {
    expect(lessonAt(LESSONS.length)).toBe(LESSONS[0]);
    expect(lessonAt(-3)).toBe(LESSONS[0]);
  });
});
