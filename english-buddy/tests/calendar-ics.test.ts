import { describe, expect, it } from "vitest";
import { looksEnglish, parseIcs } from "@/lib/calendar/ics";

const FROM = new Date("2026-09-07T00:00:00Z");
const opts = { from: FROM, days: 14, timeZone: "Europe/Rome" };

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
}

/**
 * A working calendar is not a list of dates. It is folded lines, four kinds of
 * timestamp, escaped punctuation, and mostly repeating events — and each of
 * those, unhandled, turns somebody's full week into two lunches.
 */
describe("leggere un calendario vero", () => {
  it("reads a plain timed meeting in the user's own clock", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T073000Z\r\nSUMMARY:Board call\r\nEND:VEVENT"
    ), opts);
    // 07:30 UTC in Rome in September is 09:30.
    expect(event).toMatchObject({ uid: "a1", title: "Board call", date: "2026-09-10", time: "09:30" });
  });

  it("honours a named timezone rather than guessing", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:a2\r\nDTSTART;TZID=America/New_York:20260910T090000\r\nSUMMARY:NY sync\r\nEND:VEVENT"
    ), opts);
    // 09:00 in New York is 15:00 in Rome.
    expect(event.time).toBe("15:00");
  });

  it("treats an all-day entry as having no time", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:a3\r\nDTSTART;VALUE=DATE:20260911\r\nSUMMARY:Fiera\r\nEND:VEVENT"
    ), opts);
    expect(event).toMatchObject({ date: "2026-09-11", time: null });
  });

  it("rejoins a line the format broke in half", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:a4\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Negotiation with the\r\n  German supplier\r\nEND:VEVENT"
    ), opts);
    expect(event.title).toBe("Negotiation with the German supplier");
  });

  it("puts back the punctuation the format escaped", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:a5\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Prezzi\\, sconti e consegne\r\nDESCRIPTION:Riga uno\\nRiga due\r\nEND:VEVENT"
    ), opts);
    expect(event.title).toBe("Prezzi, sconti e consegne");
    expect(event.description).toBe("Riga uno\nRiga due");
  });

  it("expands a weekly meeting into each of its occurrences", () => {
    const events = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:w1\r\nDTSTART:20260901T080000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=TU\r\nSUMMARY:Weekly sync\r\nEND:VEVENT"
    ), opts);
    expect(events.map((e) => e.date)).toEqual(["2026-09-08", "2026-09-15"]);
    // Each occurrence is its own thing to prepare for.
    expect(new Set(events.map((e) => e.uid)).size).toBe(2);
  });

  it("stops a repeat at the date it was told to stop", () => {
    const events = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:w2\r\nDTSTART:20260901T080000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260909T000000Z\r\nSUMMARY:Ends soon\r\nEND:VEVENT"
    ), opts);
    expect(events.map((e) => e.date)).toEqual(["2026-09-08"]);
  });

  it("respects an interval of more than one", () => {
    const events = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:w3\r\nDTSTART:20260901T080000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU\r\nSUMMARY:Fortnightly\r\nEND:VEVENT"
    ), opts);
    expect(events.map((e) => e.date)).toEqual(["2026-09-15"]);
  });

  it("leaves out what is outside the window, and what was cancelled", () => {
    const events = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:o1\r\nDTSTART:20260801T080000Z\r\nSUMMARY:Il mese scorso\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:o2\r\nDTSTART:20261201T080000Z\r\nSUMMARY:Dicembre\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:o3\r\nDTSTART:20260910T080000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Annullata\r\nEND:VEVENT"
    ), opts);
    expect(events).toHaveLength(0);
  });

  it("counts the guests and where they are from", () => {
    const [event] = parseIcs(ics(
      "BEGIN:VEVENT\r\nUID:g1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Kickoff\r\n" +
      "ATTENDEE;CN=Jane:mailto:jane@acme.co.uk\r\nATTENDEE:mailto:marco@azienda.it\r\nEND:VEVENT"
    ), opts);
    expect(event.guests).toBe(2);
    expect(event.guestDomains).toContain("acme.co.uk");
  });

  it("survives something that is not a calendar at all", () => {
    expect(parseIcs("questa non è una agenda", opts)).toEqual([]);
    expect(parseIcs("", opts)).toEqual([]);
  });
});

describe("quali riunioni sono probabilmente in inglese", () => {
  const base = { uid: "x", date: "2026-09-10", time: "09:00", location: "", description: "", guests: 0, guestDomains: [] };

  it("spots a foreign guest, a video link, or the words themselves", () => {
    expect(looksEnglish({ ...base, title: "Riunione", guestDomains: ["acme.co.uk"] })).toBe(true);
    expect(looksEnglish({ ...base, title: "Riunione", location: "https://zoom.us/j/123" })).toBe(true);
    expect(looksEnglish({ ...base, title: "Board call Q3" })).toBe(true);
  });

  it("leaves the dentist alone", () => {
    expect(looksEnglish({ ...base, title: "Dentista", guestDomains: ["studio.it"] })).toBe(false);
  });
});
