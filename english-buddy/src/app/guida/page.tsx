import Link from "next/link";
import { SitePage } from "@/components/SitePage";
import { LandingTracker } from "@/app/LandingTracker";
import { GuidePlayer } from "./GuidePlayer";
import { clock, guides, resolveDeepLink } from "@/lib/guide";
import styles from "./guide.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Guida ExecLingo: video e capitoli per usare l’app con Sam",
  description:
    "Manuale completo e sintesi di 3 minuti, con capitoli su Sam, allenamenti, notifiche, calendari e abbonamenti. Trova subito il passaggio che ti serve.",
  alternates: { canonical: "/guida" },
};

type GuidaPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The video manual, on a page anybody can be sent to.
 *
 * Public on purpose. Half the value of a manual is being able to answer a
 * question with a link, and a link that first asks the reader to sign in is
 * not an answer. It is also the honest version of the sales page: someone
 * deciding whether to pay can watch the whole thing first.
 */
export default async function GuidaPage({ searchParams }: GuidaPageProps) {
  const params = await searchParams;
  const all = guides();
  const { guide, chapter } = resolveDeepLink({ v: first(params.v), c: first(params.c) }, all);

  return (
    <SitePage>
      <LandingTracker page="guida" />
      <div className={styles.root}>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>Video manuale · Coach Sam</div>
          <h1>Trova subito il passaggio che ti serve.</h1>
          <p className={styles.intro}>Segui la guida completa oppure parti dalla sintesi. L’indice ti porta direttamente a registrazione, allenamenti, notifiche, pagamenti e tutte le altre sezioni.</p>
        </section>
        <GuidePlayer key={`${guide.key}:${chapter?.slug ?? "inizio"}`} guides={all} initial={guide.key} startAt={chapter?.start ?? 0} />

      <section className={styles.cta}>
        <div><h2>Da qui si comincia</h2><p>
          Il test del livello dura tre minuti ed è gratuito, anche senza abbonamento.
        </p></div>
        <Link href="/register">
          Prova ExecLingo
        </Link>
      </section>

      {/* Said plainly, and on the page rather than in a footnote: the film is
          drawn, and the voice is not a person. Anybody who watches it will
          work that out in ninety seconds, and finding it out for themselves
          costs more than being told. */}
      <p className={styles.note}>
        Le schermate del video sono <strong>ricostruite a scopo dimostrativo</strong>: nomi, mail e documenti sono
        inventati, nessun account è stato creato e nessun pagamento è stato eseguito per girarlo. La voce narrante è{" "}
        <strong>generata con intelligenza artificiale</strong>. I prezzi mostrati sono quelli in vigore alla
        registrazione del video: valgono le condizioni indicate al momento dell&rsquo;acquisto.
      </p>

      <p className={styles.note}>
        Durata: guida completa {clock(693)}, sintesi {clock(180)}.{" "}
        <Link href="/scarica" style={{ fontWeight: 700 }}>Scarica l&rsquo;app</Link> ·{" "}
        <Link href="/privacy" style={{ fontWeight: 700 }}>Privacy</Link>
      </p>
      </div>
    </SitePage>
  );
}
