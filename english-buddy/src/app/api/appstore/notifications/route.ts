import { NextResponse } from "next/server";
import { handleNotification, verifyNotification, type AppleNotification } from "@/lib/appstore";

/**
 * App Store Server Notifications V2 (renewals, cancellations, refunds).
 * The signed payload's certificate chain is verified against Apple's root CA
 * before anything touches billing. Always 200 on processed notifications so
 * Apple stops retrying; 401 only for signatures that don't verify.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { signedPayload?: string } | null;
  if (!body?.signedPayload) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const payload = verifyNotification<AppleNotification>(body.signedPayload);
  if (!payload) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const outcome = await handleNotification(payload);
  console.log(`[appstore] notification ${outcome.type ?? "?"} handled=${outcome.handled}`);
  return NextResponse.json({ ok: true });
}
