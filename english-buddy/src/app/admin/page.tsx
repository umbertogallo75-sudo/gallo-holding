import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { CAPABILITIES } from "@/lib/learning/capabilities";
import { modelStatus } from "@/lib/ai/models";
import { emailFrom, emailReplyTo, isEmailConfigured } from "@/lib/email";
import { lifecycleStart } from "@/lib/marketing/lifecycle";
import { emailLabel, emailStats } from "@/lib/marketing/stats";
import { marketingTags } from "@/lib/consent";
import { readLatestCompletedMarketingSnapshot } from "@/lib/marketing/collector-store";
import { buildMarketingReport } from "@/lib/marketing/performance-report";
import { AdminActions } from "./AdminActions";
import { AdminTools } from "./AdminTools";
import { AdminCampaign } from "./AdminCampaign";
import {
  MarketingDashboard,
  adminTab,
  type DashboardFunnelRow,
  type DashboardPageRow,
  type DashboardSourceRow,
  type MarketingDashboardData,
} from "./MarketingDashboard";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{ tab?: string | string[] }>;
};

/**
 * Owner dashboard. First-party values are read live from Turso; metrics that
 * need an external reporting API stay nullable and therefore render as
 * "in attesa", never as an invented zero.
 */
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!(await isAdminUser(session.userId, session.method))) redirect("/home");

  const selectedTab = adminTab((await searchParams).tab);
  const database = db();

  const [profiles, minutes, lastSessions, caps, pushes, lastNotifs, authUsers] = await Promise.all([
    database.execute("SELECT id, display_name, starting_level, notification_intensity, created_at FROM profiles ORDER BY created_at ASC"),
    database.execute("SELECT user_id, SUM(minutes_practiced) AS total_minutes, SUM(interactions) AS total_interactions, MAX(day) AS last_day FROM daily_metrics GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(started_at) AS last_session, COUNT(*) AS session_count FROM sessions GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS cap_count FROM user_capabilities GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS sub_count FROM push_subscriptions GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(sent_at) AS last_sent, COUNT(*) AS sent_count FROM notification_history GROUP BY user_id"),
    database.execute("SELECT id, email FROM auth_users"),
  ]);

  // The same user can emit onboarding twice (client acknowledgement + server
  // save), so person-level conversion events are deduplicated by user id.
  // Technical QA traffic is excluded before it can reach any commercial KPI.
  const funnel = await database
    .execute(
      `SELECT e.name,
              COUNT(DISTINCT CASE
                WHEN e.created_at >= datetime('now', '-7 days') THEN
                  CASE WHEN e.name IN ('register_done', 'onboarding_done', 'purchase_stripe', 'purchase_apple', 'purchase_google')
                    THEN COALESCE(e.user_id, e.id) ELSE e.id END
              END) AS d7,
              COUNT(DISTINCT CASE
                WHEN e.name IN ('register_done', 'onboarding_done', 'purchase_stripe', 'purchase_apple', 'purchase_google')
                  THEN COALESCE(e.user_id, e.id) ELSE e.id END
              ) AS d30,
              COUNT(DISTINCT e.visitor_id) AS visitors30
       FROM analytics_events e
       LEFT JOIN auth_users au ON au.id = e.user_id
       LEFT JOIN user_attribution ua ON ua.user_id = e.user_id
       WHERE e.created_at >= datetime('now', '-30 days')
         AND lower(COALESCE(au.email, '')) NOT LIKE '%+execlingo-qa_%'
         AND lower(COALESCE(ua.medium, '')) <> 'qa'
         AND lower(COALESCE(ua.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(ua.campaign, '')) NOT LIKE 'tracking_validation_%'
         AND lower(COALESCE(json_extract(e.meta, '$.medium'), '')) <> 'qa'
         AND lower(COALESCE(json_extract(e.meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(json_extract(e.meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'
       GROUP BY e.name`
    )
    .catch(() => null);
  const funnelBy = new Map((funnel?.rows ?? []).map((row) => [String(row.name), row]));
  const f = (name: string, column: "d7" | "d30" | "visitors30") => Number(funnelBy.get(name)?.[column] ?? 0);

  // Platform is server-derived at registration time. Older rows have no tag,
  // so they remain explicitly unclassified instead of being guessed as web.
  const registrationPlatforms = await database
    .execute(
      `SELECT CASE
                WHEN json_extract(e.meta, '$.platform') IN ('android', 'ios', 'web')
                  THEN json_extract(e.meta, '$.platform')
                ELSE 'unknown'
              END AS platform,
              COUNT(DISTINCT CASE
                WHEN e.created_at >= datetime('now', '-7 days') THEN COALESCE(e.user_id, e.id)
              END) AS d7,
              COUNT(DISTINCT COALESCE(e.user_id, e.id)) AS d30
       FROM analytics_events e
       LEFT JOIN auth_users au ON au.id = e.user_id
       LEFT JOIN user_attribution ua ON ua.user_id = e.user_id
       WHERE e.name = 'register_done'
         AND e.created_at >= datetime('now', '-30 days')
         AND lower(COALESCE(au.email, '')) NOT LIKE '%+execlingo-qa_%'
         AND lower(COALESCE(ua.medium, '')) <> 'qa'
         AND lower(COALESCE(ua.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(ua.campaign, '')) NOT LIKE 'tracking_validation_%'
         AND lower(COALESCE(json_extract(e.meta, '$.medium'), '')) <> 'qa'
         AND lower(COALESCE(json_extract(e.meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(json_extract(e.meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'
       GROUP BY platform`
    )
    .catch(() => null);
  const registrationPlatformBy = new Map(
    (registrationPlatforms?.rows ?? []).map((row) => [String(row.platform), row])
  );
  const platformMetric = (platform: "android" | "ios" | "web" | "unknown", column: "d7" | "d30") =>
    registrationPlatforms ? Number(registrationPlatformBy.get(platform)?.[column] ?? 0) : null;

  const pages = await database
    .execute(
      `SELECT json_extract(meta, '$.page') AS page,
              COUNT(*) AS views,
              COUNT(DISTINCT visitor_id) AS visitors
       FROM analytics_events
       WHERE name = 'page_view' AND created_at >= datetime('now', '-30 days')
         AND json_extract(meta, '$.page') IS NOT NULL
         AND lower(COALESCE(json_extract(meta, '$.medium'), '')) <> 'qa'
         AND lower(COALESCE(json_extract(meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(json_extract(meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'
       GROUP BY page ORDER BY views DESC LIMIT 20`
    )
    .catch(() => null);

  const siteVisitors = await database
    .execute(
      `SELECT COUNT(DISTINCT visitor_id) AS n
       FROM analytics_events
       WHERE name = 'page_view' AND created_at >= datetime('now', '-30 days')
         AND lower(COALESCE(json_extract(meta, '$.medium'), '')) <> 'qa'
         AND lower(COALESCE(json_extract(meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(json_extract(meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'`
    )
    .catch(() => null);

  const bySource = await (async () => {
    try {
      const [visits, signups, buyers] = await Promise.all([
        database.execute(
          `SELECT COALESCE(json_extract(meta, '$.src'), 'non tracciato') AS src, COUNT(DISTINCT visitor_id) AS n
           FROM analytics_events
           WHERE name = 'landing_view' AND created_at >= datetime('now', '-30 days')
             AND lower(COALESCE(json_extract(meta, '$.medium'), '')) <> 'qa'
             AND lower(COALESCE(json_extract(meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
             AND lower(COALESCE(json_extract(meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'
           GROUP BY src`
        ),
        database.execute(
          `SELECT a.source AS src, COUNT(DISTINCT a.user_id) AS n
           FROM user_attribution a LEFT JOIN auth_users u ON u.id = a.user_id
           WHERE a.created_at >= datetime('now', '-30 days')
             AND lower(COALESCE(u.email, '')) NOT LIKE '%+execlingo-qa_%'
             AND lower(COALESCE(a.medium, '')) <> 'qa'
             AND lower(COALESCE(a.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
             AND lower(COALESCE(a.campaign, '')) NOT LIKE 'tracking_validation_%'
           GROUP BY a.source`
        ),
        database.execute(
          `SELECT a.source AS src, COUNT(DISTINCT e.user_id) AS n
           FROM analytics_events e
           JOIN user_attribution a ON a.user_id = e.user_id
           LEFT JOIN auth_users u ON u.id = e.user_id
           WHERE e.name IN ('purchase_stripe', 'purchase_apple', 'purchase_google')
             AND e.created_at >= datetime('now', '-30 days')
             AND lower(COALESCE(u.email, '')) NOT LIKE '%+execlingo-qa_%'
             AND lower(COALESCE(a.medium, '')) <> 'qa'
             AND lower(COALESCE(a.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
             AND lower(COALESCE(a.campaign, '')) NOT LIKE 'tracking_validation_%'
           GROUP BY a.source`
        ),
      ]);
      type SourceTotals = { visits: number; signups: number; buyers: number };
      const merged = new Map<string, SourceTotals>();
      const fold = (rows: ArrayLike<Record<string, unknown>>, key: keyof SourceTotals) => {
        for (let index = 0; index < rows.length; index += 1) {
          const source = String(rows[index].src ?? "non tracciato") || "non tracciato";
          const entry = merged.get(source) ?? { visits: 0, signups: 0, buyers: 0 };
          entry[key] = Number(rows[index].n ?? 0);
          merged.set(source, entry);
        }
      };
      fold(visits.rows, "visits");
      fold(signups.rows, "signups");
      fold(buyers.rows, "buyers");
      return [...merged.entries()]
        .map(([source, row]) => ({ source, ...row }))
        .sort((a, b) => b.buyers - a.buyers || b.signups - a.signups || b.visits - a.visits);
    } catch {
      return null;
    }
  })();

  // Count people, not webhook rows: purchase events are not guaranteed to be
  // idempotent yet, while DISTINCT user_id is safe for this KPI.
  const payerCounts = await database
    .execute(
      `SELECT COUNT(DISTINCT CASE WHEN e.created_at >= datetime('now', '-7 days') THEN e.user_id END) AS d7,
              COUNT(DISTINCT e.user_id) AS d30
       FROM analytics_events e
       LEFT JOIN auth_users u ON u.id = e.user_id
       LEFT JOIN user_attribution a ON a.user_id = e.user_id
       WHERE e.name IN ('purchase_stripe', 'purchase_apple', 'purchase_google')
         AND e.created_at >= datetime('now', '-30 days')
         AND lower(COALESCE(u.email, '')) NOT LIKE '%+execlingo-qa_%'
         AND lower(COALESCE(a.medium, '')) <> 'qa'
         AND lower(COALESCE(a.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
         AND lower(COALESCE(a.campaign, '')) NOT LIKE 'tracking_validation_%'`
    )
    .catch(() => null);

  const consent = await database
    .execute(
      `SELECT choice, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM consent_log WHERE created_at >= datetime('now', '-90 days') GROUP BY choice`
    )
    .catch(() => null);
  const consentRows = consent?.rows ?? [];
  const consentTotal = consentRows.reduce((sum, row) => sum + Number(row.n ?? 0), 0);

  const billingRows = await database.execute("SELECT user_id, plan, status FROM billing").catch(() => null);
  const billingBy = new Map((billingRows?.rows ?? []).map((row) => [String(row.user_id), row]));
  const by = (result: { rows: ArrayLike<Record<string, unknown>> }) =>
    new Map(Array.from(result.rows).map((row) => [String(row.user_id), row]));
  const minutesBy = by(minutes);
  const sessionsBy = by(lastSessions);
  const capsBy = by(caps);
  const pushBy = by(pushes);
  const notifBy = by(lastNotifs);
  const emailById = new Map(authUsers.rows.map((row) => [String(row.id), row.email ? String(row.email) : null]));

  // eslint-disable-next-line react-hooks/purity -- server component, rendered fresh per request
  const now = Date.now();
  const userRows = profiles.rows.map((profile) => {
    const id = String(profile.id);
    const metric = minutesBy.get(id);
    const session = sessionsBy.get(id);
    const lastActivity = session?.last_session ? String(session.last_session) : null;
    const daysIdle = lastActivity ? Math.floor((now - Date.parse(lastActivity)) / 86_400_000) : null;
    return {
      id,
      email: emailById.get(id) ?? null,
      name: String(profile.display_name ?? "—"),
      startingLevel: profile.starting_level ? String(profile.starting_level) : "—",
      intensity: String(profile.notification_intensity ?? "immersive"),
      createdAt: String(profile.created_at ?? "").slice(0, 10),
      totalMinutes: Number(metric?.total_minutes ?? 0),
      totalInteractions: Number(metric?.total_interactions ?? 0),
      sessionCount: Number(session?.session_count ?? 0),
      lastActivity: lastActivity ? lastActivity.slice(0, 16).replace("T", " ") : "mai",
      daysIdle,
      capCount: Number(capsBy.get(id)?.cap_count ?? 0),
      hasPush: Number(pushBy.get(id)?.sub_count ?? 0) > 0,
      notifCount: Number(notifBy.get(id)?.sent_count ?? 0),
      plan: billingBy.get(id)?.status === "active" ? String(billingBy.get(id)?.plan ?? "") : "",
    };
  });

  const pageRows: DashboardPageRow[] | null = pages
    ? Array.from(pages.rows).map((row) => ({
        page: String(row.page),
        views: Number(row.views ?? 0),
        visitors: Number(row.visitors ?? 0),
      }))
    : null;
  const sourceRows: DashboardSourceRow[] | null = bySource
    ? bySource.map((row) => ({ source: row.source, visits: row.visits, signups: row.signups, buyers: row.buyers }))
    : null;
  const firstPartyLive = funnel !== null;
  const metric = (name: string, column: "d7" | "d30" | "visitors30") => firstPartyLive ? f(name, column) : null;
  const payers7 = payerCounts ? Number(payerCounts.rows[0]?.d7 ?? 0) : null;
  const payers30 = payerCounts ? Number(payerCounts.rows[0]?.d30 ?? 0) : null;
  const storeClicks7 = firstPartyLive ? f("landing_store_ios", "d7") + f("landing_store_android", "d7") : null;
  const storeClicks30 = firstPartyLive ? f("landing_store_ios", "d30") + f("landing_store_android", "d30") : null;
  const pageViews30 = pageRows ? pageRows.reduce((sum, row) => sum + row.views, 0) : null;
  const funnelRows: DashboardFunnelRow[] = [
    { label: "Visite alla landing", d7: metric("landing_view", "d7"), d30: metric("landing_view", "d30"), note: "Ingressi nel funnel" },
    { label: "Click su registrazione", d7: metric("landing_cta_register", "d7"), d30: metric("landing_cta_register", "d30"), note: "CTA sul sito" },
    { label: "Registrazioni valide", d7: metric("register_done", "d7"), d30: metric("register_done", "d30"), note: "Persone uniche, QA esclusi" },
    { label: "↳ Android", d7: platformMetric("android", "d7"), d30: platformMetric("android", "d30"), note: "Ambiente del flusso; non prova un download" },
    { label: "↳ iOS", d7: platformMetric("ios", "d7"), d30: platformMetric("ios", "d30"), note: "Ambiente del flusso; non prova un download" },
    { label: "↳ Web", d7: platformMetric("web", "d7"), d30: platformMetric("web", "d30"), note: "Ambiente del flusso; non prova un download" },
    { label: "↳ Non classificata", d7: platformMetric("unknown", "d7"), d30: platformMetric("unknown", "d30"), note: "Storico precedente al tag o dato non valido" },
    { label: "Onboarding completati", d7: metric("onboarding_done", "d7"), d30: metric("onboarding_done", "d30"), note: "Deduplicati per account" },
    { label: "Click verso gli store", d7: storeClicks7, d30: storeClicks30, note: "Non equivale a un download" },
    { label: "Download verificati", d7: null, d30: null, note: "In attesa delle API Store" },
    { label: "Nuovi paganti", d7: payers7, d30: payers30, note: "Persone uniche con evento di acquisto" },
  ];

  const latestMarketingSnapshot = await readLatestCompletedMarketingSnapshot(database).catch(() => null);
  const latestMarketingReport = latestMarketingSnapshot ? buildMarketingReport(latestMarketingSnapshot) : null;
  const configuredBrowserTags = marketingTags();

  const dashboardData: MarketingDashboardData = {
    asOf: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date()),
    firstPartyLive,
    pageViews30,
    visitors30: siteVisitors ? Number(siteVisitors.rows[0]?.n ?? 0) : null,
    registrations7: metric("register_done", "d7"),
    registrations30: metric("register_done", "d30"),
    payers30,
    onboarding30: metric("onboarding_done", "d30"),
    storeClicks30,
    companyPageViews30: pageRows ? (pageRows.find((row) => row.page === "/aziende")?.views ?? 0) : null,
    sources: sourceRows,
    pages: pageRows,
    funnel: funnelRows,
    browserTags: {
      metaConfigured: Boolean(configuredBrowserTags.metaPixelId),
      linkedinConfigured: Boolean(configuredBrowserTags.linkedinPartnerId),
      tiktokConfigured: Boolean(configuredBrowserTags.tiktokPixelId),
    },
    external: latestMarketingReport && latestMarketingSnapshot ? {
      updatedAt: latestMarketingReport.generatedAt,
      semaphore: latestMarketingReport.semaphore,
      actualActiveBudgetEur: latestMarketingReport.actualActiveBudgetEur,
      actualConfiguredBudgetEur: latestMarketingReport.actualConfiguredBudgetEur,
      budgetVerification: latestMarketingReport.budgetVerification,
      snapshotFreshness: latestMarketingReport.snapshotFreshness,
      staleAfterHours: latestMarketingReport.staleAfterHours,
      channels: latestMarketingReport.channels,
      tracking: latestMarketingReport.tracking.map((item) => ({
        source: item.source,
        event: item.event,
        status: item.status,
        detail: item.detail,
        checkedAt: item.checkedAt,
      })),
    } : null,
  };

  const models = modelStatus();
  const mail = await emailStats();
  const overridden = models.filter((model) => model.overridden);

  return (
    <main className="shell adminShell">
      <div className="topbar">
        <div className="brand">ExecLingo · Performance</div>
        <a className="chip" href="/home">← App</a>
      </div>
      <section className="hero adminHero">
        <div className="kicker">VASP ITALIA SRL · cabina di regia</div>
        <h1>{selectedTab === "users" ? "Utenti e attività" : "Marketing, tutto in un posto"}</h1>
        <p className="muted">
          Dati proprietari live e spazi già pronti per costi, download, campagne e lead. Un valore assente resta “in attesa”: non viene mai trasformato in uno zero.
        </p>
      </section>

      <MarketingDashboard tab={selectedTab} data={dashboardData} />

      {selectedTab === "tracking" && consentTotal > 0 ? (
        <section className="card">
          <h2>🍪 Consensi registrati — ultimi 90 giorni</h2>
          <div className="adminTableWrap">
            <table className="adminTable adminDataTable">
              <thead><tr><th>Scelta</th><th>Quante</th><th>Ultima</th></tr></thead>
              <tbody>{consentRows.map((row) => (
                <tr key={String(row.choice)}>
                  <td>{row.choice === "granted" ? "Accettato" : row.choice === "denied" ? "Rifiutato" : "Revocato"}</td>
                  <td>{Number(row.n ?? 0)}</td>
                  <td>{row.last_at ? String(row.last_at).slice(0, 16).replace("T", " ") : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="itHint">Registro anonimo delle scelte cookie; nessun indirizzo IP viene conservato.</p>
        </section>
      ) : null}

      {selectedTab === "users" ? (
        <>
          <div className="adminSectionHead adminUserHead">
            <div><div className="kicker">Account</div><h2>{userRows.length} profili con attività</h2></div>
            <a href="/admin/vendite" className="secondary">📊 Sales Control Center</a>
          </div>
          <AdminTools />
          <AdminCampaign
            from={emailFrom()}
            replyTo={emailReplyTo()}
            startsOn={lifecycleStart().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            ready={isEmailConfigured()}
          />
          <section className="card">
            <h2>📬 Email partite — ultimi 30 giorni</h2>
            {mail.rows.length ? (
              <div className="adminTableWrap">
                <table className="adminTable adminDataTable">
                  <thead><tr><th>Tipo</th><th>Totale</th><th>Ultimi 7 gg</th><th>Ultima</th></tr></thead>
                  <tbody>
                    {mail.rows.map((row) => (
                      <tr key={row.kind}><td>{emailLabel(row.kind)}</td><td>{row.total}</td><td>{row.last7 || "—"}</td><td className="muted">{row.lastAt ? row.lastAt.slice(0, 16) : "—"}</td></tr>
                    ))}
                    <tr><td><strong>Totale</strong></td><td><strong>{mail.total}</strong></td><td colSpan={2}></td></tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">Non è ancora partita nessuna email.</p>}
            <p className="itHint">Disiscritti: <strong>{mail.unsubscribed}</strong>.</p>
          </section>

          <section className="card">
            <h2>🧠 Modelli in uso</h2>
            <div className="adminTableWrap">
              <table className="adminTable adminDataTable">
                <thead><tr><th>Dove</th><th>Modello attivo</th><th></th></tr></thead>
                <tbody>{models.map((model) => (
                  <tr key={model.slot}>
                    <td>{model.label}<br /><span className="muted">{model.why}</span></td>
                    <td><code>{model.inUse}</code></td>
                    <td>{model.overridden ? <strong>⚠️ non è {model.best}</strong> : "✅"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="itHint">
              Stato reale della produzione. {overridden.length ? `${overridden.length} configurazioni stanno sostituendo il modello previsto.` : "Nessuna variabile d’ambiente sta sostituendo le scelte del codice."}
            </p>
          </section>

          <div className="adminUserGrid">
            {userRows.map((row) => (
              <section className="card adminUserCard" key={row.id}>
                <div className="adminSectionHead">
                  <h2>{row.name} <span className="muted adminUserEmail">· {row.email ?? row.id}</span></h2>
                  <span className="adminUserBadges">
                    {row.plan ? <span className="chip chipBrand">{row.plan === "free" ? "🎁 gratis" : `💳 ${row.plan}`}</span> : null}
                    {row.daysIdle !== null && row.daysIdle > 3 ? <span className="warnText">fermo da {row.daysIdle} giorni</span> : <span className="chip">attivo</span>}
                  </span>
                </div>
                <div className="adminTableWrap">
                  <table className="adminTable adminDataTable">
                    <thead><tr><th>Livello</th><th>Iscritto</th><th>Ultima attività</th><th>Sessioni</th><th>Minuti</th><th>Interazioni</th><th>Capacità</th><th>Notifiche</th><th>Push</th></tr></thead>
                    <tbody><tr>
                      <td>{row.startingLevel}</td><td>{row.createdAt}</td><td>{row.lastActivity}</td><td>{row.sessionCount}</td>
                      <td>{row.totalMinutes}</td><td>{row.totalInteractions}</td><td>{row.capCount}/{CAPABILITIES.length}</td><td>{row.notifCount}</td>
                      <td>{row.hasPush ? "✓ attive" : "✗ non attive"}</td>
                    </tr></tbody>
                  </table>
                </div>
                <div className="adminUserActions">
                  {row.email ? (
                    <a
                      className="pill"
                      href={`mailto:${row.email}?subject=${encodeURIComponent("ExecLingo — come va il tuo inglese?")}&body=${encodeURIComponent(`Ciao ${row.name},\n\nho visto che è un po' che non pratichi su ExecLingo. Anche 2 minuti oggi contano!\n\nApri l'app: https://execlingo.it\n\nIl team di ExecLingo`)}`}
                    >
                      ✉️ Scrivi email
                    </a>
                  ) : null}
                  <AdminActions userId={row.id} intensity={row.intensity} hasPush={row.hasPush} hasFree={row.plan === "free"} />
                </div>
              </section>
            ))}
          </div>
          <p className="itHint adminFootnote">I profili senza attività restano separati dalle registrazioni di marketing: il numero in questa sezione indica chi ha già un profilo nell’app.</p>
        </>
      ) : null}
    </main>
  );
}
