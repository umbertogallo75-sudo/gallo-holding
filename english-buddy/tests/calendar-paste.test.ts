import { describe, expect, it } from "vitest";
import { extractUrl } from "@/app/prepara/CalendarLink";
import { safeCalendarUrl } from "@/lib/calendar/sync";

/**
 * Nobody types this address. They copy whatever their calendar showed them —
 * a whole labelled line, a link out of an email to themselves, something with
 * a stray space in it — and refusing all of that would be technically correct
 * and useless.
 */
describe("quello che finisce negli appunti", () => {
  it("finds the address inside the line the calendar showed", () => {
    expect(extractUrl("Public Calendar URL: webcal://p01-calendars.icloud.com/published/2/abc"))
      .toBe("webcal://p01-calendars.icloud.com/published/2/abc");
    expect(extractUrl("  https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics  "))
      .toBe("https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics");
  });

  it("drops the punctuation a sentence left stuck to the end", () => {
    expect(extractUrl("Il link è https://cal.example.com/a.ics.")).toBe("https://cal.example.com/a.ics");
    expect(extractUrl("(https://cal.example.com/a.ics)")).toBe("https://cal.example.com/a.ics");
  });

  it("survives a line broken in two by the email that carried it", () => {
    expect(extractUrl("webcal://p01.icloud.com/pub/2/abc\n\nInviato dal mio iPhone"))
      .toBe("webcal://p01.icloud.com/pub/2/abc");
  });

  it("hands back what it was given when there is no address in it", () => {
    // So the field shows what they pasted, and the error can say why.
    expect(extractUrl("non ho trovato niente")).toBe("non ho trovato niente");
    expect(extractUrl("")).toBe("");
  });

  it("still ends up somewhere the server agrees to fetch", () => {
    const pasted = extractUrl("Public Calendar URL: webcal://p01.icloud.com/published/2/abc");
    expect(safeCalendarUrl(pasted)).toBe("https://p01.icloud.com/published/2/abc");
    // And the convenience does not open a door: a local address stays refused
    // however nicely it was pasted.
    expect(safeCalendarUrl(extractUrl("prova questo: https://localhost/a.ics"))).toBeNull();
  });
});
