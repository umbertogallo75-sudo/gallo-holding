import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId, OWNER_ID } from "@/lib/auth";
import { findUserIdByAccessCode, updateAccessCode } from "@/lib/auth-users";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  currentCode: z.string().min(1).max(200),
  newCode: z.string().min(8, "The new code must be at least 8 characters").max(200),
});

/** Logged-in code change: requires the current code as confirmation. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "change-code"), 5, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  if (userId === OWNER_ID) {
    return NextResponse.json({ error: "Il codice del proprietario si cambia dalla variabile APP_ACCESS_CODE su Vercel." }, { status: 400 });
  }
  if ((await findUserIdByAccessCode(parsed.data.currentCode)) !== userId) {
    return NextResponse.json({ error: "Il codice attuale non è corretto." }, { status: 403 });
  }
  if (!(await updateAccessCode(userId, parsed.data.newCode))) {
    return NextResponse.json({ error: "Questo codice è già in uso — scegline un altro." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
