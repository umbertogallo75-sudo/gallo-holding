import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureCalendarSchema,
  readLink,
  readNotes,
  removeLink,
  resetCalendarSchemaCache,
  safeCalendarUrl,
  saveLink,
  saveNotes,
  syncCalendar,
} from "@/lib/calendar/sync";

const client = createClient({ url: ":memory:" });

const ICS = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const NOW = new Date("2026-09-07T09:00:00Z");

beforeEach(async () => {
  await client.execute("DROP TABLE IF EXISTS events");
  await client.execute("DROP TABLE IF EXISTS calendar_links");
  await client.execute(`CREATE TABLE events (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, event_date TEXT NOT NULL,
    event_time TEXT, prep_json TEXT, reminded_at TEXT, debrief_json TEXT, debrief_asked_at TEXT,
    created_at TEXT)`);
  resetCalendarSchemaCache();
  await ensureCalendarSchema(client);
  vi.restoreAllMocks();
});

function serve(text: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status: 200 })));
}

/**
 * The address is typed by a user and fetched by our server, which is the
 * classic way to make a server knock on doors only it can reach.
 */
describe("quali indirizzi accettiamo", () => {
  it("takes a real calendar address, and turns webcal into https", () => {
    expect(safeCalendarUrl("https://p01.icloud.com/x/calendar.ics")).toBe("https://p01.icloud.com/x/calendar.ics");
    expect(safeCalendarUrl("webcal://p01.icloud.com/x.ics")).toBe("https://p01.icloud.com/x.ics");
  });

  it("refuses the machine we are standing on, and its neighbours", () => {
    expect(safeCalendarUrl("http://example.com/c.ics")).toBeNull();
    expect(safeCalendarUrl("https://localhost/c.ics")).toBeNull();
    expect(safeCalendarUrl("https://169.254.169.254/latest/meta-data")).toBeNull();
    expect(safeCalendarUrl("https://intranet.local/c.ics")).toBeNull();
    expect(safeCalendarUrl("file:///etc/passwd")).toBeNull();
    expect(safeCalendarUrl("not a url")).toBeNull();
  });
});

describe("portare dentro il calendario", () => {
  it("imports what is coming up", async () => {
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Board call\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    expect(await syncCalendar("u1", NOW, client)).toMatchObject({ imported: 1 });
    const rows = await client.execute("SELECT title, event_date, source_uid FROM events");
    expect(rows.rows[0]).toMatchObject({ title: "Board call", event_date: "2026-09-10", source_uid: "a1" });
  });

  it("updates an appointment that moved, instead of importing it twice", async () => {
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Board call\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await syncCalendar("u1", NOW, client);
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260911T090000Z\r\nSUMMARY:Board call\r\nEND:VEVENT"));
    expect(await syncCalendar("u1", NOW, client)).toMatchObject({ imported: 0, updated: 1 });
    const rows = await client.execute("SELECT event_date FROM events");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].event_date).toBe("2026-09-11");
  });

  it("never touches an appointment the user wrote themselves", async () => {
    await client.execute("INSERT INTO events (id,user_id,title,event_date) VALUES ('mine','u1','Scritto a mano','2026-09-12')");
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Dal calendario\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await syncCalendar("u1", NOW, client);
    serve(ICS(""));
    await syncCalendar("u1", NOW, client);
    const rows = await client.execute("SELECT id FROM events");
    expect(rows.rows.map((r) => r.id)).toEqual(["mine"]);
  });

  it("keeps a cancelled meeting somebody had already prepared for", async () => {
    // Deleting it would take their prepared sheet with it, silently.
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Board call\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await syncCalendar("u1", NOW, client);
    await client.execute("UPDATE events SET prep_json = '{\"strategy\":\"x\"}' WHERE source_uid = 'a1'");
    serve(ICS(""));
    expect(await syncCalendar("u1", NOW, client)).toMatchObject({ removed: 0 });
    expect((await client.execute("SELECT id FROM events")).rows).toHaveLength(1);
  });

  it("records why a calendar could not be read, rather than failing quietly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("non sono un calendario", { status: 200 })));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await expect(syncCalendar("u1", NOW, client)).rejects.toThrow();
    expect((await readLink("u1", client))?.lastError).toContain("calendario");
  });

  it("gives back only the imported ones when the calendar is unlinked", async () => {
    await client.execute("INSERT INTO events (id,user_id,title,event_date) VALUES ('mine','u1','Mio','2026-09-12')");
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Importato\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await syncCalendar("u1", NOW, client);
    await removeLink("u1", client);
    expect(await readLink("u1", client)).toBeNull();
    expect((await client.execute("SELECT id FROM events")).rows.map((r) => r.id)).toEqual(["mine"]);
  });

  it("keeps one person's calendar out of another's", async () => {
    serve(ICS("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260910T080000Z\r\nSUMMARY:Riservata\r\nEND:VEVENT"));
    await saveLink("u1", "https://cal.example.com/a.ics", "Europe/Rome", client);
    await syncCalendar("u1", NOW, client);
    const rows = await client.execute({ sql: "SELECT user_id FROM events", args: [] });
    expect(rows.rows.every((r) => r.user_id === "u1")).toBe(true);
  });
});

describe("le note su un impegno", () => {
  it("are kept, and belong to one person", async () => {
    await client.execute("INSERT INTO events (id,user_id,title,event_date) VALUES ('e1','u1','Call','2026-09-10')");
    await saveNotes("u1", "e1", "Trattativa sul prezzo", client);
    expect(await readNotes("u1", "e1", client)).toBe("Trattativa sul prezzo");
    await saveNotes("u2", "e1", "provo a scrivere sulle tue", client);
    expect(await readNotes("u1", "e1", client)).toBe("Trattativa sul prezzo");
    expect(await readNotes("u2", "e1", client)).toBe("");
  });
});
