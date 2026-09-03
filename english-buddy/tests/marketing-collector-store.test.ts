import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimMarketingManualLease,
  claimMarketingRun,
  completeMarketingRun,
  failMarketingRun,
  markMarketingEmail,
  readLatestMarketingRun,
  readLatestCompletedMarketingSnapshot,
  upsertMarketingKpis,
  upsertMarketingTrackingHealth,
} from "@/lib/marketing/collector-store";

let client: Client;
const MORNING = new Date("2026-08-28T06:00:00.000Z");

beforeEach(() => {
  client = createClient({ url: ":memory:" });
});

afterEach(() => client.close());

describe("marketing collector persistence", () => {
  it("atomically blocks manual runs across a five-minute bucket boundary", async () => {
    const firstNow = new Date("2026-08-28T06:34:59.999Z");
    const boundaryNow = new Date("2026-08-28T06:35:00.000Z");

    const first = await claimMarketingManualLease("manual-a", client, firstNow);
    const boundary = await claimMarketingManualLease("manual-b", client, boundaryNow);
    const afterExpiry = await claimMarketingManualLease(
      "manual-c",
      client,
      new Date("2026-08-28T06:39:59.999Z"),
    );

    expect(first).toBe(true);
    expect(boundary).toBe(false);
    expect(afterExpiry).toBe(true);
  });

  it("exposes the latest running state for the Admin concurrency guard", async () => {
    await claimMarketingRun(
      { runKey: "marketing-sync:manual:2026-08-28-08-01", scheduledFor: MORNING },
      client,
      MORNING,
    );

    const latest = await readLatestMarketingRun(client);

    expect(latest).toMatchObject({
      runKey: "marketing-sync:manual:2026-08-28-08-01",
      status: "running",
      emailStatus: "pending",
    });
  });

  it("claims a scheduler slot exactly once and self-heals an empty database", async () => {
    const first = await claimMarketingRun(
      { runKey: "marketing-sync:2026-08-28:08", scheduledFor: MORNING },
      client,
      MORNING,
    );
    const retry = await claimMarketingRun(
      { runKey: "marketing-sync:2026-08-28:08", scheduledFor: MORNING },
      client,
      new Date("2026-08-28T06:05:00.000Z"),
    );

    expect(first.claimed).toBe(true);
    expect(retry.claimed).toBe(false);
    expect(retry.run.startedAt).toBe(MORNING.toISOString());
    expect((await client.execute("SELECT COUNT(*) AS n FROM marketing_sync_runs")).rows[0].n).toBe(1);
  });

  it("recovers a collector claim abandoned by a killed serverless process", async () => {
    const runKey = "marketing-sync:2026-08-28:08";
    await claimMarketingRun({ runKey, scheduledFor: MORNING }, client, MORNING);
    await upsertMarketingKpis(runKey, [{
      day: "2026-08-28",
      source: "meta",
      window: "today",
      spendMicros: 1,
      dataStatus: "partial",
    }], client, MORNING);

    const tooSoon = await claimMarketingRun(
      { runKey, scheduledFor: MORNING },
      client,
      new Date("2026-08-28T06:14:59.000Z"),
    );
    const recovered = await claimMarketingRun(
      { runKey, scheduledFor: MORNING },
      client,
      new Date("2026-08-28T06:16:00.000Z"),
    );

    expect(tooSoon.claimed).toBe(false);
    expect(recovered.claimed).toBe(true);
    expect(recovered.run.startedAt).toBe("2026-08-28T06:16:00.000Z");
    expect((await client.execute("SELECT COUNT(*) AS n FROM marketing_kpi_snapshots")).rows[0].n).toBe(0);
  });

  it("upserts arrays into one coherent completed snapshot", async () => {
    const runKey = "marketing-sync:2026-08-28:08";
    await claimMarketingRun({ runKey, scheduledFor: MORNING }, client, MORNING);

    await upsertMarketingKpis(runKey, [
      {
        day: "2026-08-28",
        source: "google_ads",
        window: "today",
        campaignId: "search-b2c",
        campaignName: "ExecLingo Search",
        campaignStatus: "enabled",
        spendMicros: 2_000_000,
        impressions: 100,
        clicks: 12,
        registrations: 1,
        costPerRegistrationMicros: 2_000_000,
        configuredMonthlyBudgetMicros: 600_000_000,
        activeMonthlyBudgetMicros: 597_970_000,
        budgetStatus: "available",
        budgetDetail: "Budget account letto.",
        campaignBudgets: [{ campaignId: "search-b2c", status: "ENABLED" }],
        dataStatus: "available",
      },
      {
        day: "2026-08-28",
        source: "google_ads",
        window: "last7",
        campaignId: "search-b2c",
        campaignName: "ExecLingo Search",
        campaignStatus: "enabled",
        spendMicros: 20_000_000,
        registrations: 5,
        costPerRegistrationMicros: 4_000_000,
        dataStatus: "available",
      },
    ], client, MORNING);

    // A provider retry updates the same run/day/campaign rather than adding a
    // second row or double-counting the spend.
    await upsertMarketingKpis(runKey, [{
      day: "2026-08-28",
      source: "google_ads",
      window: "today",
      campaignId: "search-b2c",
      campaignName: "ExecLingo Search",
      campaignStatus: "enabled",
      spendMicros: 3_500_000,
      impressions: 180,
      clicks: 19,
      registrations: 2,
      costPerRegistrationMicros: 1_750_000,
      configuredMonthlyBudgetMicros: 600_000_000,
      activeMonthlyBudgetMicros: 597_970_000,
      budgetStatus: "available",
      budgetDetail: "Budget account letto.",
      campaignBudgets: [{ campaignId: "search-b2c", status: "ENABLED" }],
      dataStatus: "available",
      sourceUpdatedAt: "2026-08-28T06:07:00.000Z",
    }], client, new Date("2026-08-28T06:08:00.000Z"));

    await upsertMarketingTrackingHealth(runKey, [{
      source: "ga4",
      event: "sign_up",
      status: "unverified",
      detail: "Evento presente, riconciliazione in attesa",
    }], client, MORNING);
    await upsertMarketingTrackingHealth(runKey, [{
      source: "ga4",
      event: "sign_up",
      status: "verified",
      lastConversionAt: "2026-08-28T05:55:00.000Z",
      detail: "Riconciliato con il backend",
    }], client, new Date("2026-08-28T06:09:00.000Z"));

    await completeMarketingRun(runKey, "success", client, new Date("2026-08-28T06:10:00.000Z"));
    const snapshot = await readLatestCompletedMarketingSnapshot(client);

    expect(snapshot?.run.status).toBe("success");
    expect(snapshot?.kpis).toHaveLength(2);
    expect(snapshot?.kpis.find((row) => row.window === "today")).toMatchObject({
      source: "google_ads",
      campaignId: "search-b2c",
      spendMicros: 3_500_000,
      registrations: 2,
      activeMonthlyBudgetMicros: 597_970_000,
      budgetStatus: "available",
      campaignBudgets: [{ campaignId: "search-b2c", status: "ENABLED" }],
      dataStatus: "available",
    });
    expect(snapshot?.kpis.find((row) => row.window === "last7")).toMatchObject({
      spendMicros: 20_000_000,
      registrations: 5,
    });
    expect(snapshot?.tracking).toHaveLength(1);
    expect(snapshot?.tracking[0]).toMatchObject({ source: "ga4", event: "sign_up", status: "verified" });
  });

  it("keeps failed runs out of the latest completed snapshot", async () => {
    const completeKey = "marketing-sync:2026-08-28:08";
    await claimMarketingRun({ runKey: completeKey, scheduledFor: MORNING }, client, MORNING);
    await upsertMarketingKpis(completeKey, [{
      day: "2026-08-28",
      source: "backend",
      window: "today",
      registrations: 3,
      dataStatus: "available",
    }], client, MORNING);
    await completeMarketingRun(completeKey, "partial", client, new Date("2026-08-28T06:10:00.000Z"));

    const failedKey = "marketing-sync:2026-08-28:17";
    await claimMarketingRun(
      { runKey: failedKey, scheduledFor: "2026-08-28T15:00:00.000Z" },
      client,
      new Date("2026-08-28T15:00:00.000Z"),
    );
    const failed = await failMarketingRun(
      failedKey,
      "provider_timeout",
      client,
      new Date("2026-08-28T15:01:00.000Z"),
    );
    const retry = await failMarketingRun(
      failedKey,
      "provider_timeout",
      client,
      new Date("2026-08-28T15:02:00.000Z"),
    );

    expect(failed.status).toBe("failed");
    expect(retry.completedAt).toBe(failed.completedAt);
    await expect(completeMarketingRun(failedKey, "success", client)).rejects.toThrow("already failed");
    expect((await readLatestCompletedMarketingSnapshot(client))?.run.runKey).toBe(completeKey);
  });

  it("does not permit a completed snapshot to be mutated", async () => {
    const runKey = "marketing-sync:2026-08-28:08";
    await claimMarketingRun({ runKey, scheduledFor: MORNING }, client, MORNING);
    await completeMarketingRun(runKey, "success", client, MORNING);

    await expect(upsertMarketingKpis(runKey, [{
      day: "2026-08-28",
      source: "meta",
      window: "today",
      spendMicros: 1,
      dataStatus: "available",
    }], client)).rejects.toThrow("already success");
  });

  it("persists a failed report email and a later successful retry", async () => {
    const runKey = "marketing-sync:2026-08-28:08";
    await claimMarketingRun({ runKey, scheduledFor: MORNING }, client, MORNING);
    await markMarketingEmail(runKey, false, client, new Date("2026-08-28T06:01:00.000Z"));
    await completeMarketingRun(runKey, "partial", client, new Date("2026-08-28T06:02:00.000Z"));

    expect((await readLatestCompletedMarketingSnapshot(client))?.run).toMatchObject({
      emailStatus: "failed",
      emailSentAt: null,
    });

    await markMarketingEmail(runKey, true, client, new Date("2026-08-28T06:31:00.000Z"));
    expect((await readLatestCompletedMarketingSnapshot(client))?.run).toMatchObject({
      emailStatus: "sent",
      emailSentAt: "2026-08-28T06:31:00.000Z",
    });
  });
});
