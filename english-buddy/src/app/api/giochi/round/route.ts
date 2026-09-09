import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { dealGame } from "@/lib/games/deal";

export const dynamic = "force-dynamic";

/** A fresh game, for the replay button. The first one is dealt by the page. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "game-round"), 60, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppe partite di fila. Riprova tra poco." }, { status: 429 });
  }
  return NextResponse.json(await dealGame(userId));
}
