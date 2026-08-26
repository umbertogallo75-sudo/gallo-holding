/**
 * Minimal transactional email via Resend. Activates when RESEND_API_KEY is
 * set (free tier: 3000 emails/month); until then callers get `false` and
 * should fall back to the admin-mediated flow.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  headers?: Record<string, string>
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailFrom(),
        ...(emailReplyTo() ? { reply_to: emailReplyTo() } : {}),
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
        // List-Unsubscribe lives here rather than only in the footer: the big
        // mailbox providers now expect bulk senders to offer it, and the ones
        // who do not are the ones who end up in the spam folder.
        ...(headers ? { headers } : {}),
      }),
    });
    if (!response.ok) console.error("email send failed:", response.status, (await response.text()).slice(0, 200));
    return response.ok;
  } catch (error) {
    console.error("email send error:", error);
    return false;
  }
}

/**
 * The address every email leaves from. Exposed because a marketing campaign
 * sent from the provider's shared sandbox domain lands in spam, and nothing
 * in the send result says so — the admin page shows this instead.
 */
export const DEFAULT_FROM = "ExecLingo <onboarding@resend.dev>";
export function emailFrom(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

/**
 * Where a reply goes. Sam's emails invite a conversation — "come back and
 * practise", "how did it go" — and some people answer them. Without this the
 * answer goes to the sending address, which usually has no mailbox behind it
 * and drops on the floor: the most engaged reader in the list, ignored.
 */
export function emailReplyTo(): string | null {
  return process.env.EMAIL_REPLY_TO?.trim() || null;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Branded, email-client-safe HTML wrapper (inline styles, table layout).
 * Dark ExecLingo header, white card, green CTA — same identity as the app.
 */
export function renderEmail(options: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  /** Present on anything that is not strictly transactional. */
  unsubscribeUrl?: string;
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaUrl, footerNote, unsubscribeUrl } = options;
  const unsubscribe = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#828a80;text-decoration:underline;">Non voglio più ricevere queste email</a> — un clic, e smettiamo.`
    : "";
  const cta =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 8px;">
           <tr><td style="border-radius:999px;background:#2f8f63;background-image:linear-gradient(135deg,#2f8f63,#37a774);text-align:center;box-shadow:0 4px 14px rgba(47,143,99,.35);">
             <a href="${ctaUrl}" style="display:inline-block;padding:16px 36px;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;border-radius:999px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${ctaLabel}</a>
           </td></tr>
         </table>
         <p style="margin:10px 0 0;font-size:12.5px;color:#8a917f;text-align:center;word-break:break-all;">Se il pulsante non funziona, copia questo link nel browser:<br><a href="${ctaUrl}" style="color:#2f8f63;">${ctaUrl}</a></p>`
      : "";
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#eef0ea;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef0ea;">
    <tr><td align="center" style="padding:30px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background-color:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background-color:#0a100c;padding:30px 30px 26px;text-align:center;">
          <div style="display:inline-block;width:50px;height:50px;line-height:50px;border-radius:15px;background-image:linear-gradient(135deg,#2f8f63,#e6a94e);color:#0a100c;font-weight:800;font-size:21px;font-family:Georgia,serif;">EL</div>
          <div style="color:#f4f6f0;font-size:21px;font-weight:800;letter-spacing:.1em;margin-top:12px;">EXECLINGO</div>
          <div style="color:#9aa396;font-size:12.5px;margin-top:5px;letter-spacing:.02em;">In 3 mesi sei operativo in inglese</div>
        </td></tr>
        <tr><td style="padding:32px 30px 26px;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#18201a;">${heading}</h1>
          ${bodyHtml}
          ${cta}
        </td></tr>
        <tr><td style="padding:20px 30px 28px;border-top:1px solid #e6e9e2;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#828a80;">
            ${footerNote || "Hai ricevuto questa email perché esiste un account ExecLingo associato a questo indirizzo."}${unsubscribe}<br>
            <strong style="color:#5c665e;">ExecLingo</strong> · un servizio VASP ITALIA SRL — Via M. Schipa 22, 80122 Napoli<br>
            <a href="https://execlingo.it" style="color:#2f8f63;text-decoration:none;">execlingo.it</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
