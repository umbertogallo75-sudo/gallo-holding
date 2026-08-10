import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId, OWNER_ID } from "@/lib/auth";
import { adminResetCode } from "@/lib/auth-users";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/sender";
import { saveBilling } from "@/lib/stripe";
import { audit, MIN_PAYOUT_CENTS, promoteHeldCommissions, setPartnerRate, setPartnerStatus } from "@/lib/partners";
import { bannerForNotification } from "@/lib/push/content";
import { randomUUID } from "node:crypto";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("nudge"),
    userId: z.string().min(1).max(80),
    message: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("intensity"),
    userId: z.string().min(1).max(80),
    intensity: z.enum(["low", "normal", "immersive"]),
  }),
  z.object({
    action: z.literal("resetcode"),
    userId: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal("freeaccess"),
    userId: z.string().min(1).max(80),
    grant: z.boolean(),
  }),
  z.object({
    action: z.literal("deleteuser"),
    userId: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal("voidtestlicenses"),
  }),
  z.object({
    action: z.literal("partnerrate"),
    partnerId: z.string().min(1).max(80),
    rate: z.number(),
  }),
  z.object({
    action: z.literal("partnerstatus"),
    partnerId: z.string().min(1).max(80),
    status: z.string().min(1).max(30),
  }),
  z.object({
    action: z.literal("payoutcreate"),
    partnerId: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal("payoutpaid"),
    payoutId: z.string().min(1).max(80),
    reference: z.string().trim().max(120).optional(),
  }),
]);

/** Owner-only actions from the monitoring dashboard. */
export async function POST(request: Request) {
  const caller = await getUserId();
  if (caller !== OWNER_ID) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = parsed.data;

  if (data.action === "resetcode") {
    const temp = await adminResetCode(data.userId);
    if (!temp) return NextResponse.json({ error: "Non posso resettare questo account" }, { status: 400 });
    return NextResponse.json({ ok: true, tempCode: temp });
  }

  if (data.action === "partnerrate") {
    try {
      await setPartnerRate(OWNER_ID, data.partnerId, data.rate);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (data.action === "partnerstatus") {
    try {
      await setPartnerStatus(OWNER_ID, data.partnerId, data.status);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (data.action === "payoutcreate") {
    await promoteHeldCommissions();
    const available = await db().execute({
      sql: "SELECT SUM(amount_cents) AS total FROM commissions WHERE partner_id = ? AND status = 'available' AND payout_id IS NULL",
      args: [data.partnerId],
    });
    const total = Number(available.rows[0]?.total ?? 0);
    if (total < MIN_PAYOUT_CENTS) {
      return NextResponse.json({ error: `Disponibile ${(total / 100).toFixed(2)} € — sotto il minimo di ${(MIN_PAYOUT_CENTS / 100).toFixed(0)} €` }, { status: 400 });
    }
    const docs = await db().execute({ sql: "SELECT payout_docs_status FROM partners WHERE user_id = ?", args: [data.partnerId] });
    if (String(docs.rows[0]?.payout_docs_status) !== "complete") {
      return NextResponse.json({ error: "Il partner non ha completato i dati di incasso" }, { status: 400 });
    }
    const payoutId = randomUUID();
    await db().execute({ sql: "INSERT INTO payouts (id, partner_id, amount_cents) VALUES (?, ?, ?)", args: [payoutId, data.partnerId, total] });
    await db().execute({
      sql: "UPDATE commissions SET payout_id = ?, status = 'processing' WHERE partner_id = ? AND status = 'available' AND payout_id IS NULL",
      args: [payoutId, data.partnerId],
    });
    await audit(OWNER_ID, "payout_created", data.partnerId, `${(total / 100).toFixed(2)} EUR payout=${payoutId}`);
    return NextResponse.json({ ok: true, payoutId, amountCents: total });
  }

  if (data.action === "payoutpaid") {
    await db().execute({
      sql: "UPDATE payouts SET status = 'paid', paid_at = CURRENT_TIMESTAMP, reference = COALESCE(?, reference) WHERE id = ?",
      args: [data.reference ?? null, data.payoutId],
    });
    await db().execute({
      sql: "UPDATE commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE payout_id = ?",
      args: [data.payoutId],
    });
    await audit(OWNER_ID, "payout_marked_paid", data.payoutId, data.reference ?? null);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "deleteuser") {
    if (data.userId === OWNER_ID) return NextResponse.json({ error: "Non puoi eliminare il tuo account" }, { status: 400 });
    const target = data.userId;
    // Full cascade across every table that references the user.
    const tables = [
      ["messages", "user_id"], ["sessions", "user_id"], ["mistakes", "user_id"], ["expressions", "user_id"],
      ["daily_metrics", "user_id"], ["push_subscriptions", "user_id"], ["notification_history", "user_id"],
      ["user_capabilities", "user_id"], ["learning_state", "user_id"], ["billing", "user_id"],
      ["analytics_events", "user_id"], ["profiles", "id"], ["auth_users", "id"],
    ];
    for (const [table, column] of tables) {
      await db().execute({ sql: `DELETE FROM ${table} WHERE ${column} = ?`, args: [target] }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  if (data.action === "voidtestlicenses") {
    // One-time sandbox cleanup: unused codes become unredeemable.
    const result = await db()
      .execute("UPDATE licenses SET status = 'void' WHERE status = 'unused'")
      .catch(() => null);
    return NextResponse.json({ ok: true, voided: Number(result?.rowsAffected ?? 0) });
  }

  if (data.action === "freeaccess") {
    // Comp accounts: full access without a plan (owner-curated list).
    await saveBilling({ userId: data.userId, plan: "free", status: data.grant ? "active" : "canceled" });
    return NextResponse.json({ ok: true });
  }

  if (data.action === "intensity") {
    await db().execute({
      sql: "UPDATE profiles SET notification_intensity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [data.intensity, data.userId],
    });
    return NextResponse.json({ ok: true });
  }

  // Nudge: one motivational push, recorded in history so the scheduler sees it.
  const question = data.message || "Sam qui, mi manchi! Una domanda veloce: How was your day? (Com\u2019\u00e8 andata la tua giornata?) Rispondi in inglese, anche una riga conta.";
  const notificationId = randomUUID();
  const delivered = await sendPushToUser(data.userId, {
    title: "Sam · ExecLingo",
    body: question,
    image: bannerForNotification({ question, kind: "nudge", seed: notificationId }),
    data: { url: `/buddy?mode=buddy&q=${encodeURIComponent(question)}&nid=${notificationId}`, nid: notificationId },
  });
  if (delivered > 0) {
    await db().execute({
      sql: "INSERT INTO notification_history (id, user_id, kind, prompt, sent_at) VALUES (?, ?, ?, ?, ?)",
      args: [notificationId, data.userId, `nudge:manual:${new Date().toISOString().slice(0, 10)}`, question, new Date().toISOString()],
    });
  }
  return NextResponse.json({ ok: true, delivered });
}
