import { ATTRIBUTION_COOKIE } from "@/lib/attribution";

/**
 * Browser half of acquisition tracking: on the first page of the first visit
 * it records where the person came from, then never touches it again.
 *
 * It writes a cookie rather than only localStorage because the server has to
 * read it — localStorage is invisible to the registration request. Everything
 * stays first-party: no third-party script, no cross-site identifier.
 */

const VISITOR_KEY = "buddy-visitor-id";
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export type ClientAttribution = {
  visitorId: string;
  source: string;
  medium: string | null;
  campaign: string | null;
};

/** The visitor id also feeds the funnel beacons, so it outlives the cookie. */
function visitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function readCookie(name: string): string | null {
  return document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;
}

/**
 * Turns a referrer into a channel name. Only used when the link carries no
 * utm_source — which is exactly the organic case worth measuring, since every
 * post written by hand arrives without campaign parameters.
 */
function channelOf(referrer: string): string {
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host.endsWith("execlingo.it")) return "direct";
    if (host.includes("linkedin") || host === "lnkd.in") return "linkedin";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook") || host === "fb.me") return "facebook";
    if (host.includes("whatsapp")) return "whatsapp";
    if (host.includes("youtube") || host === "youtu.be") return "youtube";
    if (host.includes("tiktok") || host === "tiktok.com") return "tiktok";
    if (host.includes("google")) return "google";
    if (host.includes("bing")) return "bing";
    if (host.includes("duckduckgo")) return "duckduckgo";
    if (host === "t.co" || host.includes("twitter") || host === "x.com") return "x";
    return host.slice(0, 60);
  } catch {
    return "direct";
  }
}

/**
 * Ad click ids remain useful even when a platform strips the referrer and the
 * campaign URL was created without UTMs. We keep only the platform name in
 * our first-party cookie; the external identifier itself is never persisted.
 */
function sourceFromClickId(params: URLSearchParams): string | null {
  if (params.has("gclid") || params.has("dclid") || params.has("wbraid") || params.has("gbraid")) return "google";
  if (params.has("fbclid")) return "facebook";
  if (params.has("li_fat_id")) return "linkedin";
  if (params.has("ttclid")) return "tiktok";
  if (params.has("msclkid")) return "bing";
  return null;
}

/**
 * Ensures the first-touch record exists and returns it. Safe to call from
 * several components on the same page: after the first call it only reads.
 */
export function ensureAttribution(): ClientAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const id = visitorId();
    const existing = readCookie(ATTRIBUTION_COOKIE);
    if (existing) {
      try {
        const decoded = JSON.parse(decodeURIComponent(existing)) as Record<string, string>;
        // A cookie written before the visitor id existed is still first touch:
        // keep the source, just complete it.
        if (decoded.v) {
          return {
            visitorId: decoded.v,
            source: decoded.s || "direct",
            medium: decoded.m || null,
            campaign: decoded.c || null,
          };
        }
        decoded.v = id;
        write(decoded);
        return { visitorId: id, source: decoded.s || "direct", medium: decoded.m || null, campaign: decoded.c || null };
      } catch {
        // Corrupt cookie: fall through and write a fresh one.
      }
    }

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source")?.trim().slice(0, 60) || "";
    const record: Record<string, string> = {
      v: id,
      s: utmSource || sourceFromClickId(params) || channelOf(document.referrer),
      t: new Date().toISOString(),
    };
    const medium = params.get("utm_medium")?.trim().slice(0, 60);
    const campaign = params.get("utm_campaign")?.trim().slice(0, 80);
    if (medium) record.m = medium;
    if (campaign) record.c = campaign;
    if (document.referrer) record.r = document.referrer.slice(0, 200);
    write(record);
    return { visitorId: id, source: record.s, medium: medium || null, campaign: campaign || null };
  } catch {
    // Private browsing can refuse storage entirely. Analytics never blocks.
    return null;
  }
}

function write(record: Record<string, string>): void {
  const value = encodeURIComponent(JSON.stringify(record));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
