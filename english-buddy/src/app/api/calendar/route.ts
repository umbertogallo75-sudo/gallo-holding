import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { readLink, removeLink, safeCalendarUrl, saveLink, syncCalendar } from "@/lib/calendar/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  action: z.enum(["connect", "sync", "disconnect"]),
  url: z.string().max(2000).optional(),
  timezone: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });

  if (parsed.data.action === "disconnect") {
    await removeLink(userId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "connect") {
    const url = safeCalendarUrl(parsed.data.url || "");
    if (!url) {
      return NextResponse.json(
        { error: "Quello non sembra l'indirizzo di un calendario. Deve iniziare con https:// oppure webcal://" },
        { status: 400 }
      );
    }
    await saveLink(userId, url, parsed.data.timezone?.trim() || "Europe/Rome");
  } else if (!(await readLink(userId))) {
    return NextResponse.json({ error: "Nessun calendario collegato." }, { status: 400 });
  }

  try {
    const result = await syncCalendar(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Non sono riuscito a leggere il calendario.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
