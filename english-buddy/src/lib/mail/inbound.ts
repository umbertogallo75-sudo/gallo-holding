/**
 * Turning whatever an inbound-mail provider POSTs into one shape.
 *
 * The providers that can receive mail for a domain and call a webhook all
 * describe the same message with different words — `text` or `plain` or
 * `body-plain`, `to` as a string or as a list of objects. Choosing one and
 * hard-coding its vocabulary would tie the feature to a supplier we have not
 * finished evaluating, so the parsing accepts the handful of shapes in use
 * and the rest of the code never learns which one arrived.
 */

export type Inbound = {
  toAlias: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  text: string;
};

/** Everything a message can be worth reading; past this it is a document. */
export const MAX_BODY_CHARS = 12_000;

type Unknown = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** `Marco Rossi <marco@example.com>` → the two halves, either possibly empty. */
export function splitAddress(raw: string): { name: string; address: string } {
  const value = raw.trim();
  const angled = value.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].trim().replace(/^"|"$/g, "").trim(),
      address: angled[2].trim().toLowerCase(),
    };
  }
  return { name: "", address: value.toLowerCase() };
}

/** Accepts a string, an object with an address field, or a list of either. */
function firstAddress(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstAddress(entry);
      if (found) return found;
    }
    return "";
  }
  if (value && typeof value === "object") {
    const record = value as Unknown;
    const address = str(record.address) || str(record.email) || str(record.Email) || str(record.value);
    const name = str(record.name) || str(record.Name);
    if (address) return name ? `${name} <${address}>` : address;
  }
  return "";
}

/**
 * The local part of the address the message was sent to.
 *
 * Case is dropped because mail systems disagree about it and people retype
 * these by hand; anything after a `+` is dropped too, so a forward to
 * `m-abc+cliente@…` still finds the account.
 */
export function aliasFromAddress(address: string): string {
  const { address: clean } = splitAddress(address);
  const local = clean.split("@")[0] ?? "";
  return local.split("+")[0].trim().toLowerCase();
}

/**
 * Strips the HTML a plain-text part would have carried anyway.
 *
 * Only used when the provider sends no text alternative. It is deliberately
 * blunt — this text is read by a model and shown as a quotation, not
 * rendered — but scripts and styles have to go, since their contents would
 * otherwise turn up in the middle of the quoted message.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    // An opening tag left a space where a line now starts; quoted text with a
    // ragged left edge reads as broken.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseInbound(payload: unknown): Inbound | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Unknown;
  // Some providers wrap the message; unwrap one level before reading it.
  const message = (body.data && typeof body.data === "object" ? (body.data as Unknown) : body) as Unknown;

  const to = firstAddress(message.to ?? message.To ?? message.recipient ?? message.envelope_to);
  const alias = aliasFromAddress(to);
  if (!alias) return null;

  const from = splitAddress(firstAddress(message.from ?? message.From ?? message.sender) || "");
  const text =
    str(message.text) ||
    str(message.plain) ||
    str(message["body-plain"]) ||
    str(message.TextBody) ||
    htmlToText(str(message.html) || str(message.HtmlBody) || str(message["body-html"]));

  return {
    toAlias: alias,
    fromAddress: from.address,
    fromName: from.name,
    subject: (str(message.subject) || str(message.Subject)).slice(0, 300),
    text: text.slice(0, MAX_BODY_CHARS).trim(),
  };
}

/**
 * The id of a message Resend has received, if this is that kind of delivery.
 *
 * Resend's webhook carries only the envelope — who, to whom, what subject —
 * and the body is fetched afterwards with this id. That is not a limitation
 * worth working around: knowing the recipient before downloading anything
 * means a message for an address nobody owns costs one lookup instead of a
 * download.
 */
export function receivedEmailId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Unknown;
  if (str(body.type) !== "email.received") return null;
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Unknown;
  const id = str(data.email_id) || str(data.id);
  return id || null;
}

/** The alias a delivery is addressed to, before its body has been fetched. */
export function recipientAlias(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as Unknown;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Unknown;
  return aliasFromAddress(firstAddress(data.to ?? data.To ?? data.received_for));
}
