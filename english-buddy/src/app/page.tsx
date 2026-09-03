import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isEmbeddedApp } from "@/lib/appclient";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "ExecLingo — In 3 mesi sei operativo in inglese",
  description:
    "Sam, il tuo coach personale d'inglese con intelligenza artificiale: pochi minuti al giorno, nei ritagli veri della giornata. Business e viaggi, anche partendo da zero. Prova gratis.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ExecLingo — In 3 mesi sei operativo in inglese",
    description: "Sam, il tuo coach personale d'inglese con AI: pochi minuti al giorno, business e viaggi, anche partendo da zero.",
    images: ["/banners/banner-01.png"],
    url: "/",
    siteName: "ExecLingo",
    locale: "it_IT",
    type: "website",
  },
};

export default async function Page() {
  const [userId, embedded] = await Promise.all([getUserId(), isEmbeddedApp()]);

  // Native shells keep their historical launch contract: an authenticated app
  // opens the product, never the institutional website. In a normal browser,
  // however, `/` remains the public home for everyone (including the owner),
  // with an explicit way back into the signed-in product.
  if (userId && embedded) {
    const result = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
    redirect(result.rows.length ? "/home" : "/onboarding");
  }

  return <Landing hidePricing={embedded} signedIn={Boolean(userId)} />;
}
