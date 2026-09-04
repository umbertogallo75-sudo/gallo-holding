import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { readMail } from "@/lib/mail/store";
import { MailDetail } from "./MailDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mail — ExecLingo" };

export default async function MailItemPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await readMail(id, userId);
  if (!item) notFound();

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Mail</div>
        <Link className="chip" href="/mail">← Le tue mail</Link>
      </div>
      <MailDetail item={item} />
      <BottomNav active="allenamenti" />
    </main>
  );
}
