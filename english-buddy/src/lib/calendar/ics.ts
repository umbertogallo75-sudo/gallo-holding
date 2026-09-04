/**
 * Reading a calendar the way calendars are actually written.
 *
 * Every calendar — iCloud, Google, Outlook — will publish itself at a private
 * address in this one format, which is why it is the only way in that works
 * for everyone without asking anybody to hand over an account.
 *
 * The format is thirty years old and shows it: lines wrap at seventy-five
 * characters and continue with a leading space, times come in four different
 * shapes, commas and semicolons inside text are escaped, and half the entries
 * in a working calendar are a single event with a rule attached saying it
 * happens every Tuesday. All four of those, handled here, are the difference
 * between importing somebody's week and importing three lunches.
 */

export type CalEvent = {
  uid: string;
  title: string;
  /** Local date as YYYY-MM-DD. */
  date: string;
  /** Local time as HH:MM, or null for an all-day entry. */
  time: string | null;
  location: string;
  description: string;
  /** How many people were invited, which is a fair hint that it matters. */
  guests: number;
  /** Domains of the guests, for spotting the ones likely to be in English. */
  guestDomains: string[];
};

/** Undoes the line folding the format requires, before anything else. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** `DTSTART;TZID=Europe/Rome:20260910T093000` → name, params, value. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rest] = head.split(";");
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * A calendar timestamp, as the moment it names.
 *
 * A trailing Z is UTC. A TZID is a named zone, and rather than ship a zone
 * database the offset is asked of the platform for that very instant, which
 * gets summer time right without a table that goes stale.
 */
function parseWhen(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, z] = match;
  if (!hh) {
    return { date: new Date(Date.UTC(+y, +m - 1, +d, 12, 0, 0)), allDay: true };
  }
  const asUtc = Date.UTC(+y, +m - 1, +d, +hh, +mm, +(ss ?? 0));
  if (z) return { date: new Date(asUtc), allDay: false };

  const zone = params.TZID;
  if (!zone) return { date: new Date(asUtc), allDay: false };
  try {
    // What the platform thinks that wall-clock reading is worth in that zone.
    const guess = new Date(asUtc);
    const shown = new Date(guess.toLocaleString("en-US", { timeZone: zone }));
    const utcShown = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
    return { date: new Date(asUtc + (utcShown.getTime() - shown.getTime())), allDay: false };
  } catch {
    return { date: new Date(asUtc), allDay: false };
  }
}

function localParts(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

type Rule = { freq: string; interval: number; count: number | null; until: Date | null; byDay: string[] };

function parseRule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const chunk of value.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  const freq = (parts.FREQ || "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return null;
  const until = parts.UNTIL ? parseWhen(parts.UNTIL, {})?.date ?? null : null;
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL || 1)),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    byDay: (parts.BYDAY || "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean),
  };
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * The occurrences of a repeating event that fall inside the window.
 *
 * Deliberately partial: daily, weekly and monthly repeats with an interval, an
 * end date and a list of weekdays. That is what a working calendar is full of.
 * The baroque corners of the standard — the fifth Thursday, the exceptions
 * list — are left alone rather than guessed at, because an invented meeting is
 * worse than a missing one.
 */
function expand(start: Date, rule: Rule, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const limit = rule.until && rule.until < to ? rule.until : to;
  let emitted = 0;
  const step = rule.freq === "DAILY" ? 1 : rule.freq === "WEEKLY" ? 7 : 0;

  if (rule.freq === "MONTHLY") {
    for (let i = 0; i < 24; i++) {
      const when = new Date(start);
      when.setUTCMonth(when.getUTCMonth() + i * rule.interval);
      if (when > limit) break;
      if (rule.count !== null && ++emitted > rule.count) break;
      if (when >= from) out.push(when);
    }
    return out;
  }

  const days = rule.freq === "WEEKLY" && rule.byDay.length ? rule.byDay : null;
  for (let i = 0; i < 400; i++) {
    const when = new Date(start.getTime() + i * 86_400_000);
    if (when > limit) break;
    const weeksApart = Math.floor((when.getTime() - start.getTime()) / (7 * 86_400_000));
    const matches = days
      ? weeksApart % rule.interval === 0 && days.includes(WEEKDAYS[when.getUTCDay()])
      : i % (step * rule.interval) === 0;
    if (!matches) continue;
    if (rule.count !== null && ++emitted > rule.count) break;
    if (when >= from) out.push(when);
    if (out.length > 60) break;
  }
  return out;
}

export type ParseOptions = { from: Date; days: number; timeZone?: string };

export function parseIcs(text: string, options: ParseOptions): CalEvent[] {
  const timeZone = options.timeZone || "Europe/Rome";
  const to = new Date(options.from.getTime() + options.days * 86_400_000);
  const events: CalEvent[] = [];
  let current: Record<string, { params: Record<string, string>; value: string }> | null = null;
  let guests: string[] = [];

  for (const line of unfold(text)) {
    if (line.startsWith("BEGIN:VEVENT")) { current = {}; guests = []; continue; }
    if (line.startsWith("END:VEVENT")) {
      if (current) collect(current, guests);
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = splitLine(line);
    if (!parsed) continue;
    if (parsed.name === "ATTENDEE") {
      const address = parsed.value.replace(/^mailto:/i, "").trim().toLowerCase();
      if (address.includes("@")) guests.push(address);
      continue;
    }
    current[parsed.name] = { params: parsed.params, value: parsed.value };
  }

  function collect(fields: Record<string, { params: Record<string, string>; value: string }>, attendees: string[]) {
    const startField = fields.DTSTART;
    if (!startField) return;
    const when = parseWhen(startField.value, startField.params);
    if (!when) return;
    // A cancelled meeting is not a meeting.
    if ((fields.STATUS?.value || "").toUpperCase() === "CANCELLED") return;

    const title = unescape(fields.SUMMARY?.value || "").slice(0, 200);
    if (!title) return;

    const rule = fields.RRULE ? parseRule(fields.RRULE.value) : null;
    const occurrences = rule
      ? expand(when.date, rule, options.from, to)
      : when.date >= options.from && when.date <= to
        ? [when.date]
        : [];

    const uid = unescape(fields.UID?.value || title).slice(0, 120);
    for (const occurrence of occurrences) {
      const local = localParts(occurrence, timeZone);
      events.push({
        // One row per occurrence, so next Tuesday's meeting and the one after
        // are two different things to prepare for.
        uid: rule ? `${uid}#${local.date}` : uid,
        title,
        date: local.date,
        time: when.allDay ? null : local.time,
        location: unescape(fields.LOCATION?.value || "").slice(0, 200),
        description: unescape(fields.DESCRIPTION?.value || "").slice(0, 2000),
        guests: attendees.length,
        guestDomains: [...new Set(attendees.map((a) => a.split("@")[1]).filter(Boolean))].slice(0, 10),
      });
    }
  }

  events.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return events.slice(0, 100);
}

/**
 * Whether this is plausibly a meeting held in English.
 *
 * Used to decide what to offer rather than what to import, so it errs towards
 * asking: a guest from a domain that is not Italian, a video-call link, or
 * English words in the title. Getting it wrong costs one ignored suggestion.
 */
const ENGLISH_HINTS = /\b(call|meeting|sync|review|kick[- ]?off|standup|stand-up|weekly|board|demo|interview|workshop|catch[- ]?up|briefing|negotiation|pitch)\b/i;
const VIDEO_HINTS = /(zoom\.us|teams\.microsoft|meet\.google|webex|whereby\.com|gotomeet)/i;

export function looksEnglish(event: CalEvent): boolean {
  if (VIDEO_HINTS.test(event.location) || VIDEO_HINTS.test(event.description)) return true;
  if (ENGLISH_HINTS.test(event.title)) return true;
  return event.guestDomains.some((domain) => !domain.endsWith(".it"));
}
