import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { CANONICAL_APP_STORE_URL, CANONICAL_PLAY_STORE_URL } from "@/lib/store-links";
import { StoreBadges } from "@/components/StoreBadges";

vi.mock("@/lib/appclient", () => ({
  isEmbeddedApp: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue(null),
}));

const original = {
  APP_STORE_URL: process.env.APP_STORE_URL,
  PLAY_STORE_URL: process.env.PLAY_STORE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function nativeElements(node: ReactNode, tag: string): ElementProps[] {
  if (Array.isArray(node)) return node.flatMap((child) => nativeElements(child, tag));
  if (!isValidElement(node)) return [];
  const props = node.props as ElementProps;
  return [
    ...(node.type === tag ? [props] : []),
    ...nativeElements(props.children, tag),
  ];
}

function allElementProps(node: ReactNode): ElementProps[] {
  if (Array.isArray(node)) return node.flatMap(allElementProps);
  if (!isValidElement(node)) return [];
  const props = node.props as ElementProps;
  return [props, ...allElementProps(props.children)];
}

describe("store cutover pages", () => {
  it("keeps the Play badge hidden on /scarica until the approved URL is configured", async () => {
    delete process.env.APP_STORE_URL;
    delete process.env.PLAY_STORE_URL;
    const { default: ScaricaPage } = await import("@/app/scarica/page");

    const page = await ScaricaPage({ searchParams: Promise.resolve({ utm_source: "meta" }) });
    const androidStoreLinks = allElementProps(page)
      .filter((props) => props.where === "scarica" && props.playStoreUrl);

    expect(androidStoreLinks).toHaveLength(0);
  });

  it("adds the canonical Play badge with campaign referrer on /scarica", async () => {
    delete process.env.APP_STORE_URL;
    process.env.PLAY_STORE_URL = CANONICAL_PLAY_STORE_URL;
    const { default: ScaricaPage } = await import("@/app/scarica/page");

    const page = await ScaricaPage({
      searchParams: Promise.resolve({ utm_source: "google", utm_campaign: "android", token: "private" }),
    });
    const [badges] = allElementProps(page)
      .filter((props) => props.where === "scarica" && props.playStoreUrl);
    const destination = new URL(String(badges?.playStoreUrl));

    expect(destination.origin + destination.pathname).toBe("https://play.google.com/store/apps/details");
    expect(destination.searchParams.get("id")).toBe("it.execlingo.app");
    expect(destination.searchParams.get("referrer")).toBe("utm_source=google&utm_campaign=android");
    expect(destination.href).not.toContain("token");
  });

  it("uses the same attributed Play URL for both /inglese-lavoro buttons", async () => {
    process.env.PLAY_STORE_URL = CANONICAL_PLAY_STORE_URL;
    const { default: InglesePerLavoroPage } = await import("@/app/inglese-lavoro/page");

    const page = await InglesePerLavoroPage({
      searchParams: Promise.resolve({ utm_source: "meta", utm_medium: "paid_social" }),
    });
    const android = allElementProps(page)
      .filter((props) => props.where && props.playStoreUrl);

    expect(android).toHaveLength(2);
    for (const link of android) {
      expect(new URL(String(link.playStoreUrl)).searchParams.get("referrer")).toBe(
        "utm_source=meta&utm_medium=paid_social",
      );
    }
  });

  it("renders both official store destinations with platform-specific tracking", () => {
    const badges = StoreBadges({
      where: "test_surface",
      appStoreUrl: CANONICAL_APP_STORE_URL,
      playStoreUrl: CANONICAL_PLAY_STORE_URL,
    });
    const links = nativeElements(badges, "a");

    expect(links.map((link) => link.href)).toEqual([
      CANONICAL_APP_STORE_URL,
      CANONICAL_PLAY_STORE_URL,
    ]);
    expect(links.map((link) => link["data-track"])).toEqual([
      "landing_store_ios",
      "landing_store_android",
    ]);
    expect(links.every((link) => link["data-where"] === "test_surface")).toBe(true);
  });

  it("publishes only the canonical Play URL in SoftwareApplication structured data", async () => {
    delete process.env.APP_STORE_URL;
    process.env.PLAY_STORE_URL = `${CANONICAL_PLAY_STORE_URL}&hl=it&gl=IT`;
    const { default: RootLayout } = await import("@/app/layout");

    const layout = RootLayout({ children: null });
    const [jsonLd] = nativeElements(layout, "script")
      .filter((props) => props.type === "application/ld+json");
    const raw = (jsonLd?.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html ?? "{}";
    const graph = JSON.parse(raw)["@graph"] as Array<Record<string, unknown>>;
    const app = graph.find((item) => item["@type"] === "SoftwareApplication");

    expect(app?.downloadUrl).toEqual([CANONICAL_PLAY_STORE_URL]);
    expect(app?.sameAs).toEqual([CANONICAL_PLAY_STORE_URL]);
  });
});
