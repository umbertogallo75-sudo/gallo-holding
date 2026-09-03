import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  isAdminUser: vi.fn(),
  db: vi.fn(() => ({ name: "database" })),
  readLatestMarketingRun: vi.fn(),
  claimMarketingManualLease: vi.fn(),
  claimMarketingRun: vi.fn(),
  manualMarketingSlot: vi.fn(() => ({
    runKey: "marketing-sync:manual:2026-08-30-12-34",
    scheduledFor: new Date("2026-08-30T10:34:00.000Z"),
  })),
  executeClaimedMarketingRun: vi.fn(),
  retryMarketingReportEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/admin-access", () => ({ isAdminUser: mocks.isAdminUser }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/marketing/collector-store", () => ({
  claimMarketingRun: mocks.claimMarketingRun,
  claimMarketingManualLease: mocks.claimMarketingManualLease,
  readLatestMarketingRun: mocks.readLatestMarketingRun,
}));
vi.mock("@/lib/marketing/performance-report", () => ({
  manualMarketingSlot: mocks.manualMarketingSlot,
  executeClaimedMarketingRun: mocks.executeClaimedMarketingRun,
  retryMarketingReportEmail: mocks.retryMarketingReportEmail,
}));

import { POST } from "@/app/api/admin/marketing-report/route";

const completedRun = {
  runKey: "marketing-sync:manual:2026-08-30-12-34",
  status: "success",
  emailStatus: "sent",
  completedAt: "2026-08-30T10:34:12.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthSession.mockResolvedValue({ userId: "owner", method: "password" });
  mocks.isAdminUser.mockResolvedValue(true);
  mocks.readLatestMarketingRun.mockResolvedValue(null);
  mocks.claimMarketingManualLease.mockResolvedValue(true);
});

function request({
  origin = "https://www.execlingo.it",
  sendEmail = true,
}: { origin?: string; sendEmail?: boolean } = {}) {
  return new Request("https://www.execlingo.it/api/admin/marketing-report", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ sendEmail }),
  });
}

describe("POST /api/admin/marketing-report", () => {
  it("fails closed before touching the collector for a non-admin session", async () => {
    mocks.isAdminUser.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.claimMarketingRun).not.toHaveBeenCalled();
  });

  it("claims, collects and returns the real email outcome", async () => {
    mocks.claimMarketingRun.mockResolvedValue({ claimed: true, run: { ...completedRun, status: "running" } });
    mocks.executeClaimedMarketingRun.mockResolvedValue({
      snapshot: { run: { ...completedRun, status: "partial" } },
      report: { semaphore: "Giallo" },
      emailSent: true,
    });

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, reused: false, status: "partial", emailRequested: true, emailSent: true, semaphore: "Giallo" });
    expect(mocks.executeClaimedMarketingRun).toHaveBeenCalledTimes(1);
    expect(mocks.executeClaimedMarketingRun).toHaveBeenCalledWith(
      "marketing-sync:manual:2026-08-30-12-34",
      expect.any(Date),
      { name: "database" },
      { sendReportEmail: true },
    );
  });

  it("does not run the collector twice when the same minute is already running", async () => {
    mocks.claimMarketingRun.mockResolvedValue({
      claimed: false,
      run: { ...completedRun, status: "running", emailStatus: "pending", completedAt: null },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.executeClaimedMarketingRun).not.toHaveBeenCalled();
    expect(mocks.retryMarketingReportEmail).not.toHaveBeenCalled();
  });

  it("reuses a completed double click and retries only a missing email", async () => {
    mocks.claimMarketingRun.mockResolvedValue({
      claimed: false,
      run: { ...completedRun, status: "partial", emailStatus: "failed" },
    });
    mocks.retryMarketingReportEmail.mockResolvedValue({ attempted: true, sent: true });

    const response = await POST(request());
    const data = await response.json();

    expect(data).toMatchObject({ ok: true, reused: true, status: "partial", emailSent: true });
    expect(mocks.executeClaimedMarketingRun).not.toHaveBeenCalled();
    expect(mocks.retryMarketingReportEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-site request before reading the ADMIN session", async () => {
    const response = await POST(request({ origin: "https://attacker.example" }));

    expect(response.status).toBe(403);
    expect(mocks.getAuthSession).not.toHaveBeenCalled();
    expect(mocks.claimMarketingRun).not.toHaveBeenCalled();
  });

  it("reuses a report completed less than five minutes ago across minute boundaries", async () => {
    mocks.readLatestMarketingRun.mockResolvedValue({
      ...completedRun,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const response = await POST(request());
    const data = await response.json();

    expect(data).toMatchObject({ ok: true, reused: true, emailSent: true });
    expect(mocks.manualMarketingSlot).not.toHaveBeenCalled();
    expect(mocks.claimMarketingRun).not.toHaveBeenCalled();
    expect(mocks.executeClaimedMarketingRun).not.toHaveBeenCalled();
  });

  it("does not collect when another device owns the atomic manual lease", async () => {
    mocks.claimMarketingManualLease.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.claimMarketingRun).not.toHaveBeenCalled();
    expect(mocks.executeClaimedMarketingRun).not.toHaveBeenCalled();
  });

  it("refreshes data without sending or retrying email when requested", async () => {
    mocks.claimMarketingRun.mockResolvedValue({ claimed: true, run: { ...completedRun, status: "running" } });
    mocks.executeClaimedMarketingRun.mockResolvedValue({
      snapshot: { run: { ...completedRun, status: "success", emailStatus: "pending" } },
      report: { semaphore: "Verde" },
      emailSent: false,
    });

    const response = await POST(request({ sendEmail: false }));
    const data = await response.json();

    expect(data).toMatchObject({ ok: true, emailRequested: false, emailSent: false });
    expect(mocks.executeClaimedMarketingRun).toHaveBeenCalledWith(
      "marketing-sync:manual:2026-08-30-12-34",
      expect.any(Date),
      { name: "database" },
      { sendReportEmail: false },
    );
    expect(mocks.retryMarketingReportEmail).not.toHaveBeenCalled();
  });

  it("does not retry a failed email during a refresh-only cooldown", async () => {
    mocks.readLatestMarketingRun.mockResolvedValue({
      ...completedRun,
      emailStatus: "failed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const response = await POST(request({ sendEmail: false }));
    const data = await response.json();

    expect(data).toMatchObject({ ok: true, reused: true, emailRequested: false, emailSent: false });
    expect(mocks.retryMarketingReportEmail).not.toHaveBeenCalled();
    expect(mocks.executeClaimedMarketingRun).not.toHaveBeenCalled();
  });
});
