import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Durable, read-only-marketing collector storage.
 *
 * A run is claimed before any provider is queried. Its key is the scheduler's
 * idempotency key (for example `marketing-sync:2026-08-28:08`), so retries and
 * overlapping invocations cannot create two reports for the same slot.
 *
 * KPI and tracking rows include the run key in their primary key. Upserts are
 * therefore safe while a run is being assembled, while completed snapshots
 * remain immutable and can be read back as one coherent report.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS marketing_sync_runs (
  run_key TEXT PRIMARY KEY,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  failure_code TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  email_attempted_at TEXT,
  email_sent_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marketing_sync_runs_completed
  ON marketing_sync_runs(status, completed_at DESC);

CREATE TABLE IF NOT EXISTS marketing_sync_leases (
  lease_key TEXT PRIMARY KEY,
  run_key TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_kpi_snapshots (
  run_key TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  "window" TEXT NOT NULL CHECK ("window" IN ('today', 'last7', 'mtd')),
  account_key TEXT NOT NULL DEFAULT '',
  campaign_key TEXT NOT NULL DEFAULT '',
  campaign_name TEXT,
  campaign_status TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  spend_micros INTEGER,
  impressions INTEGER,
  clicks INTEGER,
  downloads REAL,
  registrations REAL,
  leads REAL,
  cost_per_registration_micros INTEGER,
  cost_per_lead_micros INTEGER,
  configured_monthly_budget_micros INTEGER,
  active_monthly_budget_micros INTEGER,
  budget_status TEXT,
  budget_detail TEXT,
  campaign_budgets_json TEXT,
  data_status TEXT NOT NULL CHECK (data_status IN ('available', 'partial', 'stale', 'unavailable')),
  source_updated_at TEXT,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (run_key, day, source, "window", account_key, campaign_key),
  FOREIGN KEY (run_key) REFERENCES marketing_sync_runs(run_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_marketing_kpi_snapshots_run
  ON marketing_kpi_snapshots(run_key, source, day, "window");

CREATE TABLE IF NOT EXISTS marketing_tracking_health (
  run_key TEXT NOT NULL,
  source TEXT NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'unverified', 'blind', 'stale', 'unavailable')),
  last_conversion_at TEXT,
  detail TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (run_key, source, event_name),
  FOREIGN KEY (run_key) REFERENCES marketing_sync_runs(run_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_marketing_tracking_health_run
  ON marketing_tracking_health(run_key, source);`;

const schemaReady = new WeakMap<object, Promise<void>>();
const STALE_RUN_MS = 15 * 60_000;

function ensureSchema(client: Client): Promise<void> {
  const key = client as object;
  const existing = schemaReady.get(key);
  if (existing) return existing;
  const pending = client.executeMultiple(SCHEMA).then(() => undefined).catch((error) => {
    schemaReady.delete(key);
    throw error;
  });
  schemaReady.set(key, pending);
  return pending;
}

export type MarketingRunStatus = "running" | "success" | "partial" | "failed";
export type MarketingDataStatus = "available" | "partial" | "stale" | "unavailable";
export type MarketingTrackingStatus = "verified" | "unverified" | "blind" | "stale" | "unavailable";
export type MarketingKpiWindow = "today" | "last7" | "mtd";

export type MarketingRun = {
  runKey: string;
  scheduledFor: string;
  status: MarketingRunStatus;
  startedAt: string;
  completedAt: string | null;
  failureCode: string | null;
  emailStatus: "pending" | "sent" | "failed";
  emailAttemptedAt: string | null;
  emailSentAt: string | null;
  updatedAt: string;
};

export type MarketingKpiInput = {
  /** Local reporting day (Europe/Rome), formatted YYYY-MM-DD. */
  day: string;
  source: string;
  window: MarketingKpiWindow;
  accountId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  campaignStatus?: string | null;
  currency?: string;
  spendMicros?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  downloads?: number | null;
  registrations?: number | null;
  leads?: number | null;
  costPerRegistrationMicros?: number | null;
  costPerLeadMicros?: number | null;
  configuredMonthlyBudgetMicros?: number | null;
  activeMonthlyBudgetMicros?: number | null;
  budgetStatus?: "available" | "unavailable" | "error" | null;
  budgetDetail?: string | null;
  campaignBudgets?: unknown[];
  dataStatus: MarketingDataStatus;
  sourceUpdatedAt?: Date | string | null;
};

export type MarketingKpi = MarketingKpiInput & {
  runKey: string;
  accountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignStatus: string | null;
  currency: string;
  spendMicros: number | null;
  impressions: number | null;
  clicks: number | null;
  downloads: number | null;
  registrations: number | null;
  leads: number | null;
  costPerRegistrationMicros: number | null;
  costPerLeadMicros: number | null;
  configuredMonthlyBudgetMicros: number | null;
  activeMonthlyBudgetMicros: number | null;
  budgetStatus: "available" | "unavailable" | "error" | null;
  budgetDetail: string | null;
  campaignBudgets: unknown[];
  sourceUpdatedAt: string | null;
  collectedAt: string;
};

export type MarketingTrackingInput = {
  source: string;
  event: string;
  status: MarketingTrackingStatus;
  lastConversionAt?: Date | string | null;
  /** Short diagnostic only. Never pass response bodies, tokens or credentials. */
  detail?: string | null;
};

export type MarketingTrackingHealth = MarketingTrackingInput & {
  runKey: string;
  lastConversionAt: string | null;
  detail: string | null;
  checkedAt: string;
};

export type MarketingSnapshot = {
  run: MarketingRun;
  kpis: MarketingKpi[];
  tracking: MarketingTrackingHealth[];
};

function iso(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid date`);
  return date.toISOString();
}

function requiredText(value: string, label: string, max = 160): string {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error(`${label} is invalid`);
  return clean;
}

function optionalText(value: string | null | undefined, max = 500): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : null;
}

function metricDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error("date must be YYYY-MM-DD");
  }
  return value;
}

function nullableNumber(value: number | null | undefined, label: string, integer = false): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function nullableStamp(value: Date | string | null | undefined, label: string): string | null {
  return value === undefined || value === null ? null : iso(value, label);
}

function toRun(row: Record<string, unknown>): MarketingRun {
  return {
    runKey: String(row.run_key),
    scheduledFor: String(row.scheduled_for),
    status: String(row.status) as MarketingRunStatus,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    failureCode: row.failure_code ? String(row.failure_code) : null,
    emailStatus: (row.email_status ? String(row.email_status) : "pending") as MarketingRun["emailStatus"],
    emailAttemptedAt: row.email_attempted_at ? String(row.email_attempted_at) : null,
    emailSentAt: row.email_sent_at ? String(row.email_sent_at) : null,
    updatedAt: String(row.updated_at),
  };
}

function toKpi(row: Record<string, unknown>): MarketingKpi {
  const number = (value: unknown) => value === null || value === undefined ? null : Number(value);
  let campaignBudgets: unknown[] = [];
  if (typeof row.campaign_budgets_json === "string" && row.campaign_budgets_json) {
    try {
      const parsed: unknown = JSON.parse(row.campaign_budgets_json);
      if (Array.isArray(parsed)) campaignBudgets = parsed;
    } catch {
      campaignBudgets = [];
    }
  }
  return {
    runKey: String(row.run_key),
    day: String(row.day),
    source: String(row.source),
    window: String(row.window) as MarketingKpiWindow,
    accountId: row.account_key ? String(row.account_key) : null,
    campaignId: row.campaign_key ? String(row.campaign_key) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    campaignStatus: row.campaign_status ? String(row.campaign_status) : null,
    currency: String(row.currency),
    spendMicros: number(row.spend_micros),
    impressions: number(row.impressions),
    clicks: number(row.clicks),
    downloads: number(row.downloads),
    registrations: number(row.registrations),
    leads: number(row.leads),
    costPerRegistrationMicros: number(row.cost_per_registration_micros),
    costPerLeadMicros: number(row.cost_per_lead_micros),
    configuredMonthlyBudgetMicros: number(row.configured_monthly_budget_micros),
    activeMonthlyBudgetMicros: number(row.active_monthly_budget_micros),
    budgetStatus: row.budget_status ? String(row.budget_status) as MarketingKpi["budgetStatus"] : null,
    budgetDetail: row.budget_detail ? String(row.budget_detail) : null,
    campaignBudgets,
    dataStatus: String(row.data_status) as MarketingDataStatus,
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
    collectedAt: String(row.collected_at),
  };
}

function toTracking(row: Record<string, unknown>): MarketingTrackingHealth {
  return {
    runKey: String(row.run_key),
    source: String(row.source),
    event: String(row.event_name),
    status: String(row.status) as MarketingTrackingStatus,
    lastConversionAt: row.last_conversion_at ? String(row.last_conversion_at) : null,
    detail: row.detail ? String(row.detail) : null,
    checkedAt: String(row.checked_at),
  };
}

async function readRun(runKey: string, client: Client): Promise<MarketingRun | null> {
  const result = await client.execute({
    sql: "SELECT * FROM marketing_sync_runs WHERE run_key = ? LIMIT 1",
    args: [runKey],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toRun(row) : null;
}

async function requireRunningRun(runKey: string, client: Client): Promise<void> {
  const run = await readRun(runKey, client);
  if (!run) throw new Error(`marketing run ${runKey} was not claimed`);
  if (run.status !== "running") throw new Error(`marketing run ${runKey} is already ${run.status}`);
}

/** Returns the newest run in any state so Admin can prevent concurrent starts. */
export async function readLatestMarketingRun(client: Client = db()): Promise<MarketingRun | null> {
  await ensureSchema(client);
  const result = await client.execute(
    `SELECT * FROM marketing_sync_runs
     ORDER BY started_at DESC, updated_at DESC
     LIMIT 1`,
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toRun(row) : null;
}

/**
 * Atomically acquires the global manual-report lease across tabs, devices and
 * serverless instances. The lease also acts as the five-minute cooldown.
 */
export async function claimMarketingManualLease(
  runKey: string,
  client: Client = db(),
  now: Date = new Date(),
  durationMs = 5 * 60_000,
): Promise<boolean> {
  await ensureSchema(client);
  const cleanRunKey = requiredText(runKey, "runKey");
  const timestamp = iso(now, "now");
  const leaseUntil = iso(new Date(now.getTime() + durationMs), "leaseUntil");
  const result = await client.execute({
    sql: `INSERT INTO marketing_sync_leases (lease_key, run_key, lease_until, updated_at)
          VALUES ('admin-manual-report', ?, ?, ?)
          ON CONFLICT(lease_key) DO UPDATE SET
            run_key = excluded.run_key,
            lease_until = excluded.lease_until,
            updated_at = excluded.updated_at
          WHERE marketing_sync_leases.lease_until <= ?`,
    args: [cleanRunKey, leaseUntil, timestamp, timestamp],
  });
  return result.rowsAffected === 1;
}

/** Claims a scheduler slot exactly once. A repeated claim returns the first run. */
export async function claimMarketingRun(
  input: { runKey: string; scheduledFor: Date | string },
  client: Client = db(),
  now: Date = new Date(),
): Promise<{ claimed: boolean; run: MarketingRun }> {
  await ensureSchema(client);
  const runKey = requiredText(input.runKey, "runKey");
  const timestamp = iso(now, "now");
  const inserted = await client.execute({
    sql: `INSERT OR IGNORE INTO marketing_sync_runs
          (run_key, scheduled_for, status, started_at, updated_at)
          VALUES (?, ?, 'running', ?, ?)`,
    args: [runKey, iso(input.scheduledFor, "scheduledFor"), timestamp, timestamp],
  });
  if (inserted.rowsAffected !== 1) {
    // A serverless process can be killed after the claim but before it marks
    // the run failed. A second scheduler wake-up may recover that slot after
    // 15 minutes; fresh or terminal runs remain strictly idempotent.
    const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();
    const reclaimed = await client.execute({
      sql: `UPDATE marketing_sync_runs
            SET started_at = ?, completed_at = NULL, failure_code = NULL,
                email_status = 'pending', email_attempted_at = NULL, email_sent_at = NULL,
                updated_at = ?
            WHERE run_key = ? AND status = 'running' AND updated_at < ?`,
      args: [timestamp, timestamp, runKey, staleBefore],
    });
    if (reclaimed.rowsAffected === 1) {
      await client.batch([
        { sql: "DELETE FROM marketing_kpi_snapshots WHERE run_key = ?", args: [runKey] },
        { sql: "DELETE FROM marketing_tracking_health WHERE run_key = ?", args: [runKey] },
      ], "write");
      const run = await readRun(runKey, client);
      if (!run) throw new Error("reclaimed marketing run was not persisted");
      return { claimed: true, run };
    }
  }
  const run = await readRun(runKey, client);
  if (!run) throw new Error("marketing run claim was not persisted");
  return { claimed: inserted.rowsAffected === 1, run };
}

/** Upserts all provider/day rows that belong to one still-running snapshot. */
export async function upsertMarketingKpis(
  runKey: string,
  kpis: MarketingKpiInput[],
  client: Client = db(),
  collectedAt: Date = new Date(),
): Promise<void> {
  await ensureSchema(client);
  const cleanRunKey = requiredText(runKey, "runKey");
  await requireRunningRun(cleanRunKey, client);
  if (kpis.length === 0) return;
  const collected = iso(collectedAt, "collectedAt");

  await client.batch(kpis.map((kpi) => {
    const currency = requiredText(kpi.currency ?? "EUR", "currency", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter code");
    if (!["today", "last7", "mtd"].includes(kpi.window)) throw new Error("window is invalid");
    return {
      sql: `INSERT INTO marketing_kpi_snapshots
            (run_key, day, source, "window", account_key, campaign_key, campaign_name, campaign_status,
             currency, spend_micros, impressions, clicks, downloads, registrations, leads,
             cost_per_registration_micros, cost_per_lead_micros,
             configured_monthly_budget_micros, active_monthly_budget_micros, budget_status, budget_detail,
             campaign_budgets_json, data_status, source_updated_at, collected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_key, day, source, "window", account_key, campaign_key) DO UPDATE SET
              campaign_name = excluded.campaign_name,
              campaign_status = excluded.campaign_status,
              currency = excluded.currency,
              spend_micros = excluded.spend_micros,
              impressions = excluded.impressions,
              clicks = excluded.clicks,
              downloads = excluded.downloads,
              registrations = excluded.registrations,
              leads = excluded.leads,
              cost_per_registration_micros = excluded.cost_per_registration_micros,
              cost_per_lead_micros = excluded.cost_per_lead_micros,
              configured_monthly_budget_micros = excluded.configured_monthly_budget_micros,
              active_monthly_budget_micros = excluded.active_monthly_budget_micros,
              budget_status = excluded.budget_status,
              budget_detail = excluded.budget_detail,
              campaign_budgets_json = excluded.campaign_budgets_json,
              data_status = excluded.data_status,
              source_updated_at = excluded.source_updated_at,
              collected_at = excluded.collected_at`,
      args: [
        cleanRunKey,
        metricDate(kpi.day),
        requiredText(kpi.source, "source", 80),
        kpi.window,
        optionalText(kpi.accountId, 120) ?? "",
        optionalText(kpi.campaignId, 120) ?? "",
        optionalText(kpi.campaignName),
        optionalText(kpi.campaignStatus, 80),
        currency,
        nullableNumber(kpi.spendMicros, "spendMicros", true),
        nullableNumber(kpi.impressions, "impressions", true),
        nullableNumber(kpi.clicks, "clicks", true),
        nullableNumber(kpi.downloads, "downloads"),
        nullableNumber(kpi.registrations, "registrations"),
        nullableNumber(kpi.leads, "leads"),
        nullableNumber(kpi.costPerRegistrationMicros, "costPerRegistrationMicros", true),
        nullableNumber(kpi.costPerLeadMicros, "costPerLeadMicros", true),
        nullableNumber(kpi.configuredMonthlyBudgetMicros, "configuredMonthlyBudgetMicros", true),
        nullableNumber(kpi.activeMonthlyBudgetMicros, "activeMonthlyBudgetMicros", true),
        kpi.budgetStatus ?? null,
        optionalText(kpi.budgetDetail, 2_000),
        kpi.campaignBudgets?.length ? JSON.stringify(kpi.campaignBudgets).slice(0, 50_000) : null,
        kpi.dataStatus,
        nullableStamp(kpi.sourceUpdatedAt, "sourceUpdatedAt"),
        collected,
      ],
    };
  }), "write");
}

/** Upserts conversion-health checks for one still-running snapshot. */
export async function upsertMarketingTrackingHealth(
  runKey: string,
  checks: MarketingTrackingInput[],
  client: Client = db(),
  checkedAt: Date = new Date(),
): Promise<void> {
  await ensureSchema(client);
  const cleanRunKey = requiredText(runKey, "runKey");
  await requireRunningRun(cleanRunKey, client);
  if (checks.length === 0) return;
  const checked = iso(checkedAt, "checkedAt");

  await client.batch(checks.map((check) => ({
    sql: `INSERT INTO marketing_tracking_health
          (run_key, source, event_name, status, last_conversion_at, detail, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_key, source, event_name) DO UPDATE SET
            status = excluded.status,
            last_conversion_at = excluded.last_conversion_at,
            detail = excluded.detail,
            checked_at = excluded.checked_at`,
    args: [
      cleanRunKey,
      requiredText(check.source, "source", 80),
      requiredText(check.event, "event", 120),
      check.status,
      nullableStamp(check.lastConversionAt, "lastConversionAt"),
      optionalText(check.detail, 1_000),
      checked,
    ],
  })), "write");
}

async function finishRun(
  runKey: string,
  status: "success" | "partial" | "failed",
  failureCode: string | null,
  client: Client,
  now: Date,
): Promise<MarketingRun> {
  await ensureSchema(client);
  const cleanRunKey = requiredText(runKey, "runKey");
  const current = await readRun(cleanRunKey, client);
  if (!current) throw new Error(`marketing run ${cleanRunKey} was not claimed`);
  if (current.status !== "running") {
    if (current.status === status) return current;
    throw new Error(`marketing run ${cleanRunKey} is already ${current.status}`);
  }
  const timestamp = iso(now, "now");
  await client.execute({
    sql: `UPDATE marketing_sync_runs
          SET status = ?, completed_at = ?, failure_code = ?, updated_at = ?
          WHERE run_key = ? AND status = 'running'`,
    args: [status, timestamp, failureCode, timestamp, cleanRunKey],
  });
  const finished = await readRun(cleanRunKey, client);
  if (!finished || finished.status !== status) throw new Error("marketing run completion lost a concurrent race");
  return finished;
}

export function completeMarketingRun(
  runKey: string,
  outcome: "success" | "partial" = "success",
  client: Client = db(),
  now: Date = new Date(),
): Promise<MarketingRun> {
  return finishRun(runKey, outcome, null, client, now);
}

/** `failureCode` must be a short classification, never a provider response body. */
export function failMarketingRun(
  runKey: string,
  failureCode: string,
  client: Client = db(),
  now: Date = new Date(),
): Promise<MarketingRun> {
  const code = requiredText(failureCode, "failureCode", 120);
  if (!/^[A-Za-z0-9_.:-]+$/.test(code)) throw new Error("failureCode must be a secret-free classification");
  return finishRun(runKey, "failed", code, client, now);
}

/** Persists the mandatory report-email outcome so a later wake-up can retry it. */
export async function markMarketingEmail(
  runKey: string,
  sent: boolean,
  client: Client = db(),
  now: Date = new Date(),
): Promise<MarketingRun> {
  await ensureSchema(client);
  const cleanRunKey = requiredText(runKey, "runKey");
  const timestamp = iso(now, "now");
  const updated = await client.execute({
    sql: `UPDATE marketing_sync_runs
          SET email_status = ?, email_attempted_at = ?, email_sent_at = ?, updated_at = ?
          WHERE run_key = ?`,
    args: [sent ? "sent" : "failed", timestamp, sent ? timestamp : null, timestamp, cleanRunKey],
  });
  if (updated.rowsAffected !== 1) throw new Error(`marketing run ${cleanRunKey} was not claimed`);
  const run = await readRun(cleanRunKey, client);
  if (!run) throw new Error("marketing email status was not persisted");
  return run;
}

export async function readMarketingSnapshot(runKey: string, client: Client = db()): Promise<MarketingSnapshot | null> {
  await ensureSchema(client);
  const run = await readRun(requiredText(runKey, "runKey"), client);
  if (!run || run.status === "running" || run.status === "failed") return null;
  const [kpis, tracking] = await Promise.all([
    client.execute({
      sql: `SELECT * FROM marketing_kpi_snapshots
            WHERE run_key = ? ORDER BY day, source, "window", account_key, campaign_key`,
      args: [run.runKey],
    }),
    client.execute({
      sql: `SELECT * FROM marketing_tracking_health
            WHERE run_key = ? ORDER BY source, event_name`,
      args: [run.runKey],
    }),
  ]);
  return {
    run,
    kpis: Array.from(kpis.rows, (item) => toKpi(item as Record<string, unknown>)),
    tracking: Array.from(tracking.rows, (item) => toTracking(item as Record<string, unknown>)),
  };
}

/** Returns the newest coherent terminal snapshot; failed/running runs are excluded. */
export async function readLatestCompletedMarketingSnapshot(client: Client = db()): Promise<MarketingSnapshot | null> {
  await ensureSchema(client);
  const runResult = await client.execute(
    `SELECT * FROM marketing_sync_runs
     WHERE status IN ('success', 'partial')
     ORDER BY completed_at DESC, started_at DESC
     LIMIT 1`
  );
  const runRow = runResult.rows[0] as Record<string, unknown> | undefined;
  if (!runRow) return null;
  const run = toRun(runRow);
  return readMarketingSnapshot(run.runKey, client);
}
