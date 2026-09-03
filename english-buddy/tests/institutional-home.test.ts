import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  getUserId: vi.fn(),
  isEmbeddedApp: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/appclient", () => ({ isEmbeddedApp: mocks.isEmbeddedApp }));
vi.mock("@/lib/db", () => ({ db: () => ({ execute: mocks.dbExecute }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { Landing } from "@/app/Landing";
import HomePage from "@/app/page";

describe("institutional home routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserId.mockResolvedValue(null);
    mocks.isEmbeddedApp.mockResolvedValue(false);
    mocks.dbExecute.mockResolvedValue({ rows: [] });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("shows the institutional landing to a signed-in web visitor", async () => {
    mocks.getUserId.mockResolvedValue("owner");

    const page = await HomePage();

    expect(isValidElement(page)).toBe(true);
    expect(page.type).toBe(Landing);
    expect(page.props).toMatchObject({ hidePricing: false, signedIn: true });
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the reader landing for a signed-out embedded shell", async () => {
    mocks.isEmbeddedApp.mockResolvedValue(true);

    const page = await HomePage();

    expect(isValidElement(page)).toBe(true);
    expect(page.type).toBe(Landing);
    expect(page.props).toMatchObject({ hidePricing: true, signedIn: false });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps an onboarded embedded user opening the product", async () => {
    mocks.getUserId.mockResolvedValue("app-user");
    mocks.isEmbeddedApp.mockResolvedValue(true);
    mocks.dbExecute.mockResolvedValue({ rows: [{ id: "app-user" }] });

    await expect(HomePage()).rejects.toThrow("redirect:/home");

    expect(mocks.redirect).toHaveBeenCalledWith("/home");
  });

  it("keeps a new embedded user entering onboarding", async () => {
    mocks.getUserId.mockResolvedValue("new-app-user");
    mocks.isEmbeddedApp.mockResolvedValue(true);

    await expect(HomePage()).rejects.toThrow("redirect:/onboarding");

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
