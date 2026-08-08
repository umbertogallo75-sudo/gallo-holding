/**
 * Minimal transactional email via Resend. Activates when RESEND_API_KEY is
 * set (free tier: 3000 emails/month); until then callers get `false` and
 * should fall back to the admin-mediated flow.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "English Buddy <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!response.ok) console.error("email send failed:", response.status, (await response.text()).slice(0, 200));
    return response.ok;
  } catch (error) {
    console.error("email send error:", error);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
