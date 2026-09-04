import { MARKETING_BUDGET_PLAN, MARKETING_BUDGET_TOTAL_EUR, sumPaidChannelSpend } from "@/lib/marketing/performance-report";
import { GOOGLE_ADS_APP_ADMIN_GUARDRAIL } from "@/lib/marketing/google-ads-app-preflight";
import { GoogleAdsAppPreflightControl } from "./GoogleAdsAppPreflightControl";
import { MarketingReportControl } from "./MarketingReportControl";

export type AdminTab =
  | "overview"
  | "acquisition"
  | "funnel"
  | "campaigns"
  | "content"
  | "tracking"
  | "users";

export const ADMIN_TABS: Array<{ id: AdminTab; label: string; short: string }> = [
  { id: "overview", label: "Panoramica", short: "Panoramica" },
  { id: "acquisition", label: "Acquisizione", short: "Acquisizione" },
  { id: "funnel", label: "Funnel", short: "Funnel" },
  { id: "campaigns", label: "Campagne e budget", short: "Campagne" },
  { id: "content", label: "Contenuti", short: "Contenuti" },
  { id: "tracking", label: "Tracking e fonti", short: "Tracking" },
  { id: "users", label: "Utenti", short: "Utenti" },
];

export function adminTab(value?: string | string[]): AdminTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return ADMIN_TABS.some((tab) => tab.id === candidate) ? (candidate as AdminTab) : "overview";
}

export type DashboardMetric = number | null;

export type DashboardSourceRow = {
  source: string;
  visits: number;
  signups: number;
  buyers: number;
};

export type DashboardPageRow = {
  page: string;
  views: number;
  visitors: number;
};

export type DashboardFunnelRow = {
  label: string;
  d7: DashboardMetric;
  d30: DashboardMetric;
  note?: string;
};

export type DashboardExternalChannel = {
  source: string;
  label: string;
  spendTodayEur: DashboardMetric;
  spend7dEur: DashboardMetric;
  resultsToday: DashboardMetric;
  results7d: DashboardMetric;
  resultLabel: string;
  costPerResult7dEur: DashboardMetric;
  campaignStatus: string | null;
  dataThrough: string | null;
  configuredMonthlyBudgetEur: DashboardMetric;
  activeMonthlyBudgetEur: DashboardMetric;
  budgetStatus: "available" | "unavailable" | "error" | null;
  budgetDetail: string | null;
  status: "available" | "partial" | "stale" | "unavailable";
  detail: string;
};

export type DashboardTrackingRow = {
  source: string;
  event: string;
  status: "verified" | "unverified" | "blind" | "stale" | "unavailable";
  detail: string | null;
  checkedAt: string;
};

export type DashboardExternalSnapshot = {
  updatedAt: string;
  semaphore: "Verde" | "Giallo" | "Rosso";
  actualActiveBudgetEur: DashboardMetric;
  actualConfiguredBudgetEur: DashboardMetric;
  budgetVerification: "verified" | "stale" | "unavailable" | "over_cap";
  snapshotFreshness: "fresh" | "stale";
  staleAfterHours: number;
  channels: DashboardExternalChannel[];
  tracking: DashboardTrackingRow[];
};

export type MarketingDashboardData = {
  asOf: string;
  firstPartyLive: boolean;
  pageViews30: DashboardMetric;
  visitors30: DashboardMetric;
  registrations7: DashboardMetric;
  registrations30: DashboardMetric;
  payers30: DashboardMetric;
  onboarding30: DashboardMetric;
  storeClicks30: DashboardMetric;
  companyPageViews30: DashboardMetric;
  sources: DashboardSourceRow[] | null;
  pages: DashboardPageRow[] | null;
  funnel: DashboardFunnelRow[];
  browserTags: {
    metaConfigured: boolean;
    linkedinConfigured: boolean;
    tiktokConfigured: boolean;
  };
  external: DashboardExternalSnapshot | null;
};

type MetricCardProps = {
  label: string;
  value: DashboardMetric;
  source: string;
  format?: "number" | "currency";
  qualifier?: string;
};

const integer = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function MetricCard({ label, value, source, format = "number", qualifier }: MetricCardProps) {
  const shown = value === null ? "—" : format === "currency" ? euro.format(value) : integer.format(value);
  return (
    <article className={`adminKpi ${value === null ? "adminKpiPending" : ""}`}>
      <div className="adminKpiLabel">{label}</div>
      <strong>{shown}</strong>
      <div className="adminKpiMeta">
        {value === null ? "In attesa di collegamento" : value === 0 ? "Nessun dato nel periodo" : qualifier ?? "Dato disponibile"}
      </div>
      <div className="adminKpiSource">Fonte: {source}</div>
    </article>
  );
}

function PendingCell({ label = "In attesa" }: { label?: string }) {
  return <span className="adminPending" title={label}>— <small>{label}</small></span>;
}

function Status({ tone, children }: { tone: "live" | "partial" | "pending" | "reserve"; children: React.ReactNode }) {
  return <span className={`adminStatus adminStatus-${tone}`}>{children}</span>;
}

function DashboardHeader({
  tab,
  asOf,
  externalAsOf,
  externalFreshness,
  staleAfterHours,
}: {
  tab: AdminTab;
  asOf: string;
  externalAsOf: string | null;
  externalFreshness: "fresh" | "stale" | null;
  staleAfterHours: number | null;
}) {
  const externalLabel = externalAsOf
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(externalAsOf))
    : "N/D";
  return (
    <>
      <MarketingReportControl />
      <nav className="adminTabs" aria-label="Sezioni dashboard">
        {ADMIN_TABS.map((item) => (
          <a
            key={item.id}
            href={`/admin?tab=${item.id}`}
            className={item.id === tab ? "active" : ""}
            aria-current={item.id === tab ? "page" : undefined}
            title={item.label}
          >
            {item.short}
          </a>
        ))}
      </nav>
      <div className="adminContextBar">
        <span><strong>Periodo:</strong> ultimi 30 giorni</span>
        <span><strong>Budget:</strong> mese corrente</span>
        <span><strong>Target:</strong> B2C + B2B</span>
        <span><strong>Test QA:</strong> esclusi</span>
        <span className="adminFreshness">
          Pagina {asOf} · API {externalLabel}
          {externalFreshness === "stale" ? ` · non aggiornate (oltre ${staleAfterHours ?? 24} ore)` : externalFreshness === "fresh" ? " · aggiornate" : ""}
        </span>
      </div>
    </>
  );
}

function externalChannel(data: MarketingDashboardData, source: string): DashboardExternalChannel | null {
  return data.external?.channels.find((item) => item.source === source) ?? null;
}

function completeSum(values: Array<number | null>): number | null {
  return values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
}

function Overview({ data }: { data: MarketingDashboardData }) {
  const spend7d = data.external ? sumPaidChannelSpend(data.external.channels, "spend7dEur") : null;
  const downloads = completeSum([
    externalChannel(data, "app_store")?.results7d ?? null,
    externalChannel(data, "google_play")?.results7d ?? null,
  ]);
  const storeCoverage = [
    externalChannel(data, "app_store")?.dataThrough,
    externalChannel(data, "google_play")?.dataThrough,
  ].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  const linkedinLeads = externalChannel(data, "linkedin")?.results7d ?? null;
  return (
    <>
      {data.external?.snapshotFreshness === "stale" ? (
        <section className="alertBar">
          <strong>Dati API non aggiornati:</strong> l&apos;ultimo snapshot è del {new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(data.external.updatedAt))} e ha superato la soglia di {data.external.staleAfterHours} ore. Aggiorna i dati prima di leggere budget o performance.
        </section>
      ) : null}
      <section className="adminKpiGrid" aria-label="Indicatori principali">
        <MetricCard label="Spesa pubblicitaria · 7 giorni" value={spend7d} source="API piattaforme" format="currency" />
        <MetricCard label="Visitatori sito" value={data.visitors30} source="ExecLingo" qualifier="Visitatori unici" />
        <MetricCard label="Registrazioni valide" value={data.registrations30} source="ExecLingo" qualifier="Account creati, QA esclusi" />
        <MetricCard label="CPR B2C complessivo riconciliato" value={null} source="Attribuzione per canale" format="currency" qualifier="Disponibile dopo deduplica tra piattaforme" />
        <MetricCard
          label="Download verificati · 7 giorni completi"
          value={downloads}
          source="App Store + Google Play"
          qualifier={storeCoverage ? `Dati completi fino al ${new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeZone: "Europe/Rome" }).format(new Date(storeCoverage))}` : undefined}
        />
        <MetricCard label="Nuovi paganti" value={data.payers30} source="ExecLingo acquisti" qualifier="Utenti distinti con acquisto registrato" />
        <MetricCard label="Lead aziendali LinkedIn · 7 giorni" value={linkedinLeads} source="LinkedIn Lead Gen" />
        <MetricCard label="Pagine viste" value={data.pageViews30} source="ExecLingo" qualifier="Pagine pubbliche" />
      </section>

      <section className="card adminBudgetCard">
        <div className="adminSectionHead">
          <div>
            <div className="kicker">Guardrail mensile</div>
            <h2>Budget massimo: 1.500 €</h2>
          </div>
          <Status tone={data.external?.budgetVerification === "verified" ? "live" : "partial"}>
            {data.external?.budgetVerification === "over_cap"
              ? `Tetto superato · ${data.external.actualActiveBudgetEur === null ? "N/D" : euro.format(data.external.actualActiveBudgetEur)}`
              : data.external?.budgetVerification === "verified"
                ? `Reale attivo · ${euro.format(data.external.actualActiveBudgetEur ?? 0)}`
                : data.external?.budgetVerification === "stale"
                  ? `Non aggiornato · ${data.external.actualActiveBudgetEur === null ? "N/D" : euro.format(data.external.actualActiveBudgetEur)}`
                : "Piano autorizzato · 1.499,97 €"}
          </Status>
        </div>
        <div className="adminBudgetTrack" aria-label="1.500 euro pianificati su 1.500 euro massimi">
          <span className="google" style={{ width: "39.865%" }} />
          <span className="meta" style={{ width: "30%" }} />
          <span className="linkedin" style={{ width: "20%" }} />
          <span className="youtube" style={{ width: "10.135%" }} />
        </div>
        <div className="adminBudgetLegend">
          <span><i className="google" /> Google Search <strong>597,97 €</strong></span>
          <span><i className="meta" /> Meta FB+IG <strong>450 €</strong></span>
          <span><i className="linkedin" /> LinkedIn B2B <strong>300 €</strong></span>
          <span><i className="youtube" /> YouTube Ads <strong>152 €</strong></span>
          <span>Google Ads App <strong>{GOOGLE_ADS_APP_ADMIN_GUARDRAIL.budgetLabel}</strong></span>
        </div>
        <div className="notice">
          {data.external?.budgetVerification === "verified"
            ? `La somma reale delle campagne attive è ${euro.format(data.external.actualActiveBudgetEur ?? 0)} e rispetta il tetto di 1.500 €.`
            : data.external?.budgetVerification === "over_cap"
              ? `Attenzione: la somma reale delle campagne attive è ${euro.format(data.external.actualActiveBudgetEur ?? 0)} e supera il tetto di 1.500 €.`
              : data.external?.budgetVerification === "stale"
                ? `L'ultima somma letta era ${data.external.actualActiveBudgetEur === null ? "N/D" : euro.format(data.external.actualActiveBudgetEur)}, ma lo snapshot è scaduto: aggiorna prima di decidere.`
              : "Il piano autorizzato resta sotto 1.500 €, ma i budget reali non sono ancora tutti leggibili. Nessun ribilanciamento viene eseguito."}
        </div>
      </section>

      <section className="adminSplit">
        <article className="card">
          <div className="kicker">Conversione</div>
          <h2>Dal sito alla registrazione</h2>
          <div className="adminBigRatio">
            {data.visitors30 !== null && data.registrations30 !== null && data.visitors30 > 0
              ? `${Math.round((data.registrations30 / data.visitors30) * 100)}%`
              : "—"}
          </div>
          <p className="muted">{data.registrations30 ?? "—"} registrazioni valide su {data.visitors30 ?? "—"} visitatori negli ultimi 30 giorni.</p>
        </article>
        <article className="card">
          <div className="kicker">Qualità dati</div>
          <h2>{data.firstPartyLive ? "Dati proprietari attivi" : "Database non disponibile"}</h2>
          <p className="muted">
            {data.firstPartyLive
              ? "Visite, registrazioni, onboarding e pagamenti arrivano dal database ExecLingo. Le fonti esterne restano separate finché non sono sincronizzate."
              : "I riquadri restano visibili, ma nessun valore viene trasformato in zero finché la fonte non risponde."}
          </p>
          <Status tone={data.firstPartyLive ? "live" : "pending"}>{data.firstPartyLive ? "Fonte attiva" : "In attesa"}</Status>
        </article>
      </section>
    </>
  );
}

function Acquisition({ data }: { data: MarketingDashboardData }) {
  return (
    <>
      <section className="card">
        <div className="adminSectionHead">
          <div><div className="kicker">Primo contatto</div><h2>Da dove arrivano — ultimi 30 giorni</h2></div>
          <Status tone={data.sources ? "live" : "pending"}>{data.sources ? "ExecLingo live" : "In attesa"}</Status>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Fonte</th><th>Visitatori</th><th>Registrati</th><th>Paganti</th><th>Visita → reg.</th><th>Reg. → pag.</th></tr></thead>
            <tbody>
              {data.sources === null ? (
                <tr><td colSpan={6}><PendingCell label="Database non disponibile" /></td></tr>
              ) : data.sources.length === 0 ? (
                <tr><td colSpan={6} className="muted">Nessun arrivo nel periodo selezionato.</td></tr>
              ) : data.sources.map((row) => (
                <tr key={row.source}>
                  <td><strong>{row.source}</strong></td>
                  <td>{integer.format(row.visits)}</td>
                  <td>{integer.format(row.signups)}</td>
                  <td>{integer.format(row.buyers)}</td>
                  <td>{row.visits ? `${Math.round((row.signups / row.visits) * 100)}%` : "—"}</td>
                  <td>{row.signups ? `${Math.round((row.buyers / row.signups) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="itHint">Attribuzione al primo arrivo. Le registrazioni QA e le campagne di verifica tecnica sono escluse automaticamente.</p>
      </section>

      <section className="card">
        <div className="adminSectionHead">
          <div><div className="kicker">Navigazione</div><h2>Pagine viste — ultimi 30 giorni</h2></div>
          <Status tone={data.pages ? "live" : "pending"}>{data.pages ? "ExecLingo live" : "In attesa"}</Status>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Pagina</th><th>Visite</th><th>Visitatori</th></tr></thead>
            <tbody>
              {data.pages === null ? (
                <tr><td colSpan={3}><PendingCell label="Database non disponibile" /></td></tr>
              ) : data.pages.length === 0 ? (
                <tr><td colSpan={3} className="muted">Nessuna pagina vista nel periodo selezionato.</td></tr>
              ) : data.pages.map((row) => (
                <tr key={row.page}><td><strong>{row.page}</strong></td><td>{integer.format(row.views)}</td><td>{integer.format(row.visitors)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Funnel({ data }: { data: MarketingDashboardData }) {
  const downloads7 = completeSum([
    externalChannel(data, "app_store")?.results7d ?? null,
    externalChannel(data, "google_play")?.results7d ?? null,
  ]);
  const linkedin = externalChannel(data, "linkedin");
  return (
    <>
      <section className="card">
        <div className="adminSectionHead">
          <div><div className="kicker">B2C</div><h2>Funnel professionisti</h2></div>
          <Status tone={data.firstPartyLive ? "live" : "pending"}>{data.firstPartyLive ? "Live" : "In attesa"}</Status>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Passaggio</th><th>7 giorni</th><th>30 giorni</th><th>Nota</th></tr></thead>
            <tbody>{data.funnel.map((row) => {
              const d7 = row.label === "Download verificati" ? downloads7 : row.d7;
              return (
              <tr key={row.label}>
                <td><strong>{row.label}</strong></td>
                <td>{d7 === null ? <PendingCell /> : integer.format(d7)}</td>
                <td>{row.d30 === null ? <PendingCell /> : integer.format(row.d30)}</td>
                <td className="muted">{row.note ?? ""}</td>
              </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="adminSectionHead">
          <div><div className="kicker">B2B</div><h2>Funnel aziende</h2></div>
          <Status tone="partial">Parziale</Status>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Passaggio</th><th>Periodo</th><th>Risultato</th><th>Fonte</th><th>Stato</th></tr></thead>
            <tbody>
              <tr><td><strong>Visite a /aziende</strong></td><td>30 giorni</td><td>{data.companyPageViews30 === null ? <PendingCell /> : integer.format(data.companyPageViews30)}</td><td>ExecLingo</td><td><Status tone={data.pages ? "live" : "pending"}>{data.pages ? "Live" : "In attesa"}</Status></td></tr>
              <tr><td><strong>Lead aziendali inviati</strong></td><td>7 giorni</td><td>{linkedin?.results7d === null || linkedin?.results7d === undefined ? <PendingCell label="N/D" /> : integer.format(linkedin.results7d)}</td><td>LinkedIn Lead Gen</td><td><Status tone={linkedin?.status === "available" ? "live" : ["partial", "stale"].includes(linkedin?.status ?? "") ? "partial" : "pending"}>{linkedin?.status === "available" ? "Disponibile" : linkedin?.status === "stale" ? "Non aggiornato" : linkedin?.status === "partial" ? "Parziale" : "API da collegare"}</Status></td></tr>
              <tr><td><strong>Lead qualificati</strong></td><td>30 giorni</td><td><PendingCell /></td><td>CRM</td><td><Status tone="pending">Fonte da collegare</Status></td></tr>
              <tr><td><strong>Licenze attivate</strong></td><td>30 giorni</td><td><PendingCell /></td><td>ExecLingo aziende</td><td><Status tone="pending">Vista da integrare</Status></td></tr>
            </tbody>
          </table>
        </div>
        <p className="itHint">Il funnel B2B resta separato da quello dei professionisti: per LinkedIn il risultato utile è il lead aziendale, non il download generico.</p>
      </section>
    </>
  );
}

const campaignMeta: Record<string, { target: string; note: string }> = {
  google_ads_search: { target: "B2C", note: "Registrazioni e download" },
  meta: { target: "B2C", note: "Budget Meta complessivo" },
  linkedin: { target: "B2B HR/L&D", note: "Solo licenze aziendali" },
  google_ads_youtube: { target: "B2C", note: "Campagna video attiva" },
  google_ads_app: { target: "B2C Android", note: GOOGLE_ADS_APP_ADMIN_GUARDRAIL.campaignNote },
};
const budgets = MARKETING_BUDGET_PLAN.map((item) => ({
  source: item.source,
  channel: item.label,
  planned: item.monthlyEur,
  ...campaignMeta[item.source],
}));

function Campaigns({ data }: { data: MarketingDashboardData }) {
  return (
    <>
      <section className="card">
        <div className="adminSectionHead">
          <div><div className="kicker">Piano autorizzato</div><h2>Campagne e budget mensile</h2></div>
          <Status tone="live">Totale 1.499,97 €</Status>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Canale</th><th>Target</th><th>Piano</th><th>Budget reale attivo</th><th>Spesa oggi</th><th>Spesa 7 giorni</th><th>Risultati 7 giorni</th><th>CPA / CPL</th><th>Stato dati</th></tr></thead>
            <tbody>{budgets.map((row) => {
              const metric = externalChannel(data, row.source);
              const tone = metric?.status === "available" ? "live" : ["partial", "stale"].includes(metric?.status ?? "") ? "partial" : "pending";
              return (
                <tr key={row.channel}>
                  <td><strong>{row.channel}</strong><br /><span className="muted">{row.note}</span></td>
                  <td>{row.target}</td>
                  <td><strong>{euro.format(row.planned)}</strong></td>
                  <td>{metric?.activeMonthlyBudgetEur === null || metric?.activeMonthlyBudgetEur === undefined ? <PendingCell label="N/D" /> : euro.format(metric.activeMonthlyBudgetEur)}</td>
                  <td>{metric?.spendTodayEur === null || metric?.spendTodayEur === undefined ? <PendingCell label="N/D" /> : euro.format(metric.spendTodayEur)}</td>
                  <td>{metric?.spend7dEur === null || metric?.spend7dEur === undefined ? <PendingCell label="N/D" /> : euro.format(metric.spend7dEur)}</td>
                  <td>{metric?.results7d === null || metric?.results7d === undefined ? <PendingCell label="N/D" /> : `${integer.format(metric.results7d)} ${metric.resultLabel}`}</td>
                  <td>{metric?.costPerResult7dEur === null || metric?.costPerResult7dEur === undefined ? <PendingCell label="N/D" /> : euro.format(metric.costPerResult7dEur)}</td>
                  <td>
                    <Status tone={tone}>{metric?.status === "available" ? "Disponibile" : metric?.status === "partial" ? "Parziale" : metric?.status === "stale" ? "Non aggiornato" : "API da collegare"}</Status>
                    {metric?.campaignStatus ? <><br /><span className="muted">Campagna: {metric.campaignStatus}</span></> : null}
                  </td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><td colSpan={2}><strong>Totale</strong></td><td><strong>{euro.format(MARKETING_BUDGET_TOTAL_EUR)}</strong></td><td><strong>{data.external?.actualActiveBudgetEur === null || data.external?.actualActiveBudgetEur === undefined ? "N/D" : euro.format(data.external.actualActiveBudgetEur)}</strong></td><td colSpan={5}>{data.external?.budgetVerification === "verified" ? "Tetto verificato." : data.external?.budgetVerification === "over_cap" ? "TETTO SUPERATO." : data.external?.budgetVerification === "stale" ? "Dato non aggiornato: eseguire il refresh." : "Verifica budget reali incompleta."}</td></tr></tfoot>
          </table>
        </div>
      </section>
      <GoogleAdsAppPreflightControl />
      <section className="alertBar">
        <strong>Regola automatica:</strong> nessun ribilanciamento viene eseguito usando dati parziali. Prima di ogni modifica il sistema somma tutte le campagne e mantiene il totale entro 1.500 € al mese.
      </section>
    </>
  );
}

function Content() {
  const channels = [
    ["Facebook", "B2C", "≥ 3 creatività", "Post, reach, click, registrazioni"],
    ["Instagram", "B2C", "≥ 3 creatività", "Reel/post, visualizzazioni, click, registrazioni"],
    ["LinkedIn", "B2B", "≥ 3 creatività", "Post e Lead Gen per HR/L&D"],
    ["YouTube", "B2C", "3–5 video brevi", "Visualizzazioni, click e conversioni della campagna attiva"],
  ];
  return (
    <>
      <section className="card">
        <div className="adminSectionHead"><div><div className="kicker">Piano editoriale</div><h2>Contenuti per canale</h2></div><Status tone="pending">Metriche API in attesa</Status></div>
        <div className="adminTableWrap">
          <table className="adminTable adminDataTable">
            <thead><tr><th>Canale</th><th>Angolo</th><th>Piano minimo</th><th>Metriche che arriveranno</th><th>Pubblicati</th><th>Conversioni</th></tr></thead>
            <tbody>{channels.map(([channel, target, plan, metrics]) => (
              <tr key={channel}><td><strong>{channel}</strong></td><td>{target}</td><td>{plan}</td><td className="muted">{metrics}</td><td><PendingCell /></td><td><PendingCell /></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="card adminRuleCard">
        <div className="kicker">Regola creativa</div>
        <h2>Video sempre con audio e sottotitoli</h2>
        <p className="muted">Ogni video destinato a Facebook, Instagram, LinkedIn o YouTube deve avere una traccia audio verificata e sottotitoli leggibili. I video non conformi non vanno pubblicati né sponsorizzati.</p>
        <div className="adminChecklist"><span>✓ Brand: ExecLingo</span><span>✓ Coach: Sam</span><span>✓ Lingua pubblico: italiano</span><span>✓ CTA misurabile</span></div>
      </section>
    </>
  );
}

function Tracking({ data }: { data: MarketingDashboardData }) {
  const definitions: Array<{
    key: string;
    label: string;
    measure: string;
    reportingKey?: string;
    tag?: "meta" | "linkedin" | "tiktok";
  }> = [
    { key: "backend", reportingKey: "backend", label: "Database ExecLingo", measure: "Visite, registrazioni, onboarding, acquisti" },
    { key: "ga4", reportingKey: "ga4", label: "Google Analytics 4", measure: "Evento web sign_up" },
    { key: "google_ads", reportingKey: "google_ads", label: "Google Ads", measure: "Registrazione completata" },
    { key: "google_ads_app", reportingKey: "google_ads_app", label: "Google Ads App", measure: GOOGLE_ADS_APP_ADMIN_GUARDRAIL.trackingMeasure },
    { key: "meta_tag", tag: "meta", label: "Meta Pixel — tag sito", measure: "Tag browser dopo consenso" },
    { key: "meta", reportingKey: "meta", label: "Meta Ads — API reporting", measure: "Spesa e CompleteRegistration attribuite" },
    { key: "linkedin_tag", tag: "linkedin", label: "LinkedIn Insight Tag — sito", measure: "Tag browser dopo consenso" },
    { key: "linkedin", reportingKey: "linkedin", label: "LinkedIn Ads — API reporting", measure: "Spesa e Lead Gen HR/L&D" },
    { key: "tiktok_tag", tag: "tiktok", label: "TikTok Pixel — sito", measure: "Registrazione web dopo consenso" },
    { key: "app_store", reportingKey: "app_store", label: "App Store Connect", measure: "Download iOS" },
    { key: "google_play", reportingKey: "google_play", label: "Google Play Console", measure: "Download Android" },
    { key: "youtube", reportingKey: "youtube", label: "YouTube Ads", measure: "Conversioni della campagna video" },
    { key: "youtube_organic", reportingKey: "youtube_organic", label: "YouTube Analytics", measure: "Visualizzazioni e interazioni organiche" },
  ];
  return (
    <section className="card">
      <div className="adminSectionHead"><div><div className="kicker">Salute del dato</div><h2>Tracking e fonti</h2></div><span className="muted">QA esclusi dai KPI</span></div>
      <div className="adminTableWrap">
        <table className="adminTable adminDataTable">
          <thead><tr><th>Fonte</th><th>Cosa misura</th><th>Stato</th><th>Dettaglio</th><th>Ultima sincronizzazione</th></tr></thead>
          <tbody>{definitions.map((definition) => {
            const check = definition.reportingKey ? data.external?.tracking.find((item) => item.source === definition.reportingKey) : undefined;
            const backendFallback = definition.key === "backend" && data.firstPartyLive;
            const tagConfigured = definition.tag === "meta"
              ? data.browserTags.metaConfigured
              : definition.tag === "linkedin"
                ? data.browserTags.linkedinConfigured
                : definition.tag === "tiktok"
                  ? data.browserTags.tiktokConfigured
                : null;
            const status = tagConfigured !== null
              ? tagConfigured ? "verified" : "unavailable"
              : check?.status ?? (backendFallback ? "verified" : "unavailable");
            const tone = status === "verified" ? "live" : ["unverified", "stale"].includes(status) ? "partial" : "pending";
            const statusLabel = tagConfigured !== null
              ? tagConfigured ? "Tag configurato" : "Tag non configurato"
              : status === "verified" ? "Verificato" : status === "unverified" ? "Da verificare" : status === "stale" ? "Non aggiornato" : status === "blind" ? "Cieco" : "API non collegata";
            const detail = tagConfigured !== null
              ? tagConfigured
                ? "Tag browser configurato e caricato soltanto dopo il consenso. Questo stato non prova l'invio o l'attribuzione di una conversione."
                : "Identificativo pubblico del tag assente dalla build."
              : check?.detail ?? (backendFallback ? "Dati proprietari disponibili." : "API reporting non collegata.");
            return (
              <tr key={definition.key}>
                <td><strong>{definition.label}</strong></td>
                <td>{definition.measure}</td>
                <td><Status tone={tone}>{statusLabel}</Status></td>
                <td className="muted">{detail}</td>
                <td>{tagConfigured !== null ? "Configurazione build" : check?.checkedAt ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(check.checkedAt)) : backendFallback ? data.asOf : <PendingCell label="API reporting non collegata" />}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="itHint">Una fonte parziale o cieca resta visibile, ma non viene usata per spostare budget. Lo zero appare soltanto quando una fonte collegata ha restituito davvero zero.</p>
    </section>
  );
}

export function MarketingDashboard({ tab, data }: { tab: AdminTab; data: MarketingDashboardData }) {
  return (
    <>
      <DashboardHeader
        tab={tab}
        asOf={data.asOf}
        externalAsOf={data.external?.updatedAt ?? null}
        externalFreshness={data.external?.snapshotFreshness ?? null}
        staleAfterHours={data.external?.staleAfterHours ?? null}
      />
      {tab === "overview" ? <Overview data={data} /> : null}
      {tab === "acquisition" ? <Acquisition data={data} /> : null}
      {tab === "funnel" ? <Funnel data={data} /> : null}
      {tab === "campaigns" ? <Campaigns data={data} /> : null}
      {tab === "content" ? <Content /> : null}
      {tab === "tracking" ? <Tracking data={data} /> : null}
    </>
  );
}
