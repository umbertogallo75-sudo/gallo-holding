import Link from "next/link";
import { SitePage } from "@/components/SitePage";
import { LandingTracker } from "@/app/LandingTracker";
import { GuidePlayer } from "./GuidePlayer";
import { clock, guides, resolveDeepLink } from "@/lib/guide";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Come si usa ExecLingo — la guida video",
  description:
    "La guida video di ExecLingo: registrazione, allenamenti con Sam, voce, agenda, mail, documenti, pagamenti. Con indice, per andare subito al punto che ti serve.",
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

      <section className="hero">
        <div className="kicker">Guida video</div>
        <h1>Come si usa ExecLingo.</h1>
        <p className="muted">
          Tutto quello che l&rsquo;app sa fare, mostrato passaggio per passaggio. Usa l&rsquo;indice per andare
          dritto a quello che ti serve: <em>inoltrare una mail</em>, <em>parlare a voce con Sam</em>,{" "}
          <em>collegare l&rsquo;agenda</em>, <em>pagare</em>.
        </p>
      </section>

      <GuidePlayer guides={all} initial={guide.key} startAt={chapter?.start ?? 0} />

      <section className="card" style={{ marginTop: 18 }}>
        <div className="kicker">Da qui si comincia</div>
        <p style={{ margin: "6px 0 12px" }}>
          Il test del livello dura tre minuti ed è gratuito, anche senza abbonamento.
        </p>
        <Link href="/register" className="primary full" style={{ textAlign: "center", textDecoration: "none" }}>
          Prova ExecLingo
        </Link>
      </section>

      {/* Said plainly, and on the page rather than in a footnote: the film is
          drawn, and the voice is not a person. Anybody who watches it will
          work that out in ninety seconds, and finding it out for themselves
          costs more than being told. */}
      <p className="composerNote" style={{ marginTop: 16 }}>
        Le schermate del video sono <strong>ricostruite a scopo dimostrativo</strong>: nomi, mail e documenti sono
        inventati, nessun account è stato creato e nessun pagamento è stato eseguito per girarlo. La voce narrante è{" "}
        <strong>generata con intelligenza artificiale</strong>. I prezzi mostrati sono quelli in vigore alla
        registrazione del video: valgono le condizioni indicate al momento dell&rsquo;acquisto.
      </p>

      <p className="composerNote">
        Durata: guida completa {clock(693)}, sintesi {clock(180)}.{" "}
        <Link href="/scarica" style={{ fontWeight: 700 }}>Scarica l&rsquo;app</Link> ·{" "}
        <Link href="/privacy" style={{ fontWeight: 700 }}>Privacy</Link>
      </p>
    </SitePage>
  );
}
