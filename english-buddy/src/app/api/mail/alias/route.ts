import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { aliasAddress, regenerateAlias } from "@/lib/mail/store";

export const dynamic = "force-dynamic";

/**
 * Replaces the personal forwarding address.
 *
 * Only ever a new one — there is no way to choose it. It is a credential, and
 * a credential somebody picks is a credential somebody guesses.
 */
export async function POST() {
  const userId = await requireUserId();
  const alias = await regenerateAlias(userId);
  return NextResponse.json({ ok: true, address: aliasAddress(alias) });
}
