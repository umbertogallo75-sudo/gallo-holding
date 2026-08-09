import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "English Buddy — In 3 mesi sei operativo in inglese",
  description:
    "Sam, il tuo coach personale d'inglese con intelligenza artificiale: pochi minuti al giorno, nei ritagli veri della giornata. Business e viaggi, anche partendo da zero. Prova gratis.",
  openGraph: {
    title: "English Buddy — In 3 mesi sei operativo in inglese",
    description: "Sam, il tuo coach personale d'inglese con AI: pochi minuti al giorno, business e viaggi, anche partendo da zero.",
    images: ["/banners/banner-01.png"],
    locale: "it_IT",
    type: "website",
  },
};

export default async function Page() {
  const userId = await getUserId();
  if (!userId) return <Landing />;
  const result = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  redirect(result.rows.length ? "/home" : "/onboarding");
}
