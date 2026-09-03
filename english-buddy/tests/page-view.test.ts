import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleTagBootstrap } from "@/components/ConsentBanner";
import {
  reportGa4PageView,
  scheduleGa4PageContext,
  scheduleGa4PageView,
  setGa4PageContext,
} from "@/components/PageView";

const before = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST12345";
});

afterEach(() => {
  process.env = { ...before };
  vi.unstubAllGlobals();
});

describe("GA4 SPA page views", () => {
  it("sets a safe initial context before config and disables its automatic page view", () => {
    const landingBootstrap = googleTagBootstrap("", "G-TEST12345", {
      pathname: "/inglese-lavoro",
      search: "?utm_source=google&utm_campaign=x&gclid=abc&token=secret",
      origin: "https://www.execlingo.it",
      referrer: "",
    });
    expect(landingBootstrap).toContain(
      `"page_location":"https://www.execlingo.it/inglese-lavoro?utm_source=google&utm_campaign=x&gclid=abc"`,
    );
    expect(landingBootstrap).not.toContain("token=secret");

    const tokenBootstrap = googleTagBootstrap(
      "",
      "G-TEST12345",
      {
        pathname: "/prova/RAW-BEARER-TOKEN",
        search: "?utm_source=x&gclid=must-not-survive&token=secret",
        origin: "https://www.execlingo.it",
        referrer: "https://www.execlingo.it/r/RAW-REFERRER-CODE?secret=yes",
      },
    );
    const safeSet = `gtag('set',{"page_path":"/prova/:token","page_location":"https://www.execlingo.it/prova/:token","page_referrer":"https://www.execlingo.it/r/:code"});`;
    expect(tokenBootstrap).toContain(safeSet);
    expect(tokenBootstrap).not.toContain("RAW-BEARER-TOKEN");
    expect(tokenBootstrap).not.toContain("RAW-REFERRER-CODE");
    expect(tokenBootstrap).not.toContain("secret=yes");
    expect(tokenBootstrap).not.toContain("utm_source=x");
    expect(tokenBootstrap).not.toContain("must-not-survive");
    expect(tokenBootstrap.indexOf(safeSet)).toBeLessThan(
      tokenBootstrap.indexOf(`gtag('config',"G-TEST12345"`),
    );
    expect(tokenBootstrap).toContain(`gtag('config',"G-TEST12345",{send_page_view:false});`);

    const privateBootstrap = googleTagBootstrap(
      "",
      "G-TEST12345",
      {
        pathname: "/home/PRIVATE-UUID",
        search: "?utm_source=must-not-survive",
        origin: "https://www.execlingo.it",
        referrer: "https://search.example/results?q=private",
      },
    );
    expect(privateBootstrap).toContain(
      `gtag('set',{"page_path":"/app","page_location":"https://www.execlingo.it/app","page_referrer":"https://search.example"});`,
    );
    expect(privateBootstrap).not.toContain("PRIVATE-UUID");
    expect(privateBootstrap).not.toContain("results?q=private");
    expect(privateBootstrap).not.toContain("must-not-survive");
  });

  it("waits for the ready event on the initial load and sends exactly once", () => {
    const gtag = vi.fn();
    let ready: (() => void) | undefined;
    const browser = {
      location: { origin: "https://www.execlingo.it" },
      gtag: undefined as typeof gtag | undefined,
      addEventListener: vi.fn((_name: string, listener: () => void) => { ready = listener; }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", { cookie: "eb_consent=2%3Agranted%3Atest-receipt", referrer: "" });

    const onSent = vi.fn();
    const cancel = scheduleGa4PageView("/scarica", "", "", onSent);
    expect(onSent).not.toHaveBeenCalled();
    expect(browser.addEventListener).toHaveBeenCalledTimes(1);

    browser.gtag = gtag;
    ready?.();
    ready?.();
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(gtag.mock.calls.filter(([command]) => command === "set")).toEqual([
      ["set", {
        page_path: "/scarica",
        page_location: "https://www.execlingo.it/scarica",
        page_referrer: "",
      }],
    ]);
    expect(gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "page_view")).toHaveLength(1);
    expect(browser.removeEventListener).toHaveBeenCalledWith(
      "execlingo:marketing-tags-ready",
      ready,
    );
    cancel();
  });

  it("sets a private initial context on ready without sending a page view", () => {
    const gtag = vi.fn();
    let ready: (() => void) | undefined;
    const browser = {
      location: { origin: "https://www.execlingo.it" },
      gtag: undefined as typeof gtag | undefined,
      addEventListener: vi.fn((_name: string, listener: () => void) => { ready = listener; }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", {
      cookie: "eb_consent=2%3Agranted%3Atest-receipt",
      referrer: "https://www.execlingo.it/reset/RAW-REFERRER-UUID?code=secret",
    });

    const onApplied = vi.fn();
    const cancel = scheduleGa4PageContext(
      "/home/RAW-PRIVATE-UUID",
      "?utm_source=must-not-survive",
      "https://www.execlingo.it/reset/RAW-REFERRER-UUID?code=secret",
      onApplied,
    );
    browser.gtag = gtag;
    ready?.();
    ready?.();

    expect(gtag.mock.calls).toEqual([
      ["set", {
        page_path: "/app",
        page_location: "https://www.execlingo.it/app",
        page_referrer: "https://www.execlingo.it/reset/:token",
      }],
    ]);
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("RAW-PRIVATE-UUID");
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("RAW-REFERRER-UUID");
    expect(onApplied).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("sends consented initial and SPA page views with absolute safe locations", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://www.execlingo.it" }, gtag });
    vi.stubGlobal("document", {
      cookie: "eb_consent=2%3Agranted%3Atest-receipt",
      referrer: "https://search.example/results?q=private",
    });

    const first = reportGa4PageView(
      "/scarica",
      "?utm_source=google&gclid=abc&token=secret",
      document.referrer,
    );
    expect(first).not.toBeNull();
    expect(reportGa4PageView("/aziende", "", first!.page_location)).not.toBeNull();
    const pageViews = gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "page_view");
    expect(pageViews[0]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/scarica",
      page_location: "https://www.execlingo.it/scarica?utm_source=google&gclid=abc",
      page_referrer: "https://search.example",
    }]);
    expect(pageViews[1]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/aziende",
      page_location: "https://www.execlingo.it/aziende",
      page_referrer: "https://www.execlingo.it/scarica?utm_source=google&gclid=abc",
    }]);
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("token=secret");
  });

  it("redacts bearer routes and never reports private routes", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://www.execlingo.it" }, gtag });
    vi.stubGlobal("document", {
      cookie: "eb_consent=2%3Agranted%3Atest-receipt",
      referrer: "https://www.execlingo.it/r/RAW-REFERRER-CODE?secret=yes",
    });

    const referral = reportGa4PageView(
      "/r/PRIVATE-CODE",
      "?utm_source=x&gclid=must-not-survive&token=secret",
      document.referrer,
    );
    expect(referral).not.toBeNull();
    const trial = reportGa4PageView(
      "/prova/RAW-BEARER-TOKEN",
      "?utm_source=x&gclid=must-not-survive&token=secret",
      referral!.page_location,
    );
    expect(trial).not.toBeNull();
    const reset = reportGa4PageView(
      "/reset/550e8400-e29b-41d4-a716-446655440000",
      "?utm_source=x",
      trial!.page_location,
    );
    expect(reset).not.toBeNull();
    expect(reportGa4PageView("/home", "?gclid=secret", reset!.page_location)).toBeNull();
    expect(reportGa4PageView("/profile", "?gclid=secret", reset!.page_location)).toBeNull();
    const privateHome = setGa4PageContext(
      "/home/PRIVATE-ACCOUNT-ID",
      "?utm_source=x&gclid=secret",
      reset!.page_location,
    );
    expect(privateHome).not.toBeNull();
    const privateProfile = setGa4PageContext(
      "/profile/PRIVATE-ACCOUNT-ID",
      "?utm_source=x",
      privateHome!.page_location,
    );
    expect(privateProfile).not.toBeNull();
    expect(reportGa4PageView("/scarica", "", privateProfile!.page_location)).not.toBeNull();
    const calls = JSON.stringify(gtag.mock.calls);
    expect(calls).not.toContain("PRIVATE-CODE");
    expect(calls).not.toContain("RAW-BEARER-TOKEN");
    expect(calls).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(calls).not.toContain("RAW-REFERRER-CODE");
    expect(calls).not.toContain("secret=yes");
    expect(calls).not.toContain("PRIVATE-ACCOUNT-ID");
    expect(calls).not.toContain("must-not-survive");
    expect(calls).not.toContain("/home");
    expect(calls).not.toContain("/profile");
    const pageViews = gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "page_view");
    expect(pageViews).toHaveLength(4);
    expect(pageViews[0]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/r/:code",
      page_location: "https://www.execlingo.it/r/:code",
      page_referrer: "https://www.execlingo.it/r/:code",
    }]);
    expect(pageViews[1]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/prova/:token",
      page_location: "https://www.execlingo.it/prova/:token",
      page_referrer: "https://www.execlingo.it/r/:code",
    }]);
    expect(pageViews[2]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/reset/:token",
      page_location: "https://www.execlingo.it/reset/:token",
      page_referrer: "https://www.execlingo.it/prova/:token",
    }]);
    expect(pageViews[3]).toEqual(["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/scarica",
      page_location: "https://www.execlingo.it/scarica",
      page_referrer: "https://www.execlingo.it/app",
    }]);
    expect(gtag.mock.calls.filter(([command]) => command === "set").slice(-3, -1)).toEqual([
      ["set", {
        page_path: "/app",
        page_location: "https://www.execlingo.it/app",
        page_referrer: "https://www.execlingo.it/reset/:token",
      }],
      ["set", {
        page_path: "/app",
        page_location: "https://www.execlingo.it/app",
        page_referrer: "https://www.execlingo.it/app",
      }],
    ]);
  });

  it("does not send before consent", () => {
    const gtag = vi.fn();
    const browserDocument = { cookie: "", referrer: "" };
    vi.stubGlobal("window", { location: { origin: "https://www.execlingo.it" }, gtag });
    vi.stubGlobal("document", browserDocument);

    expect(reportGa4PageView("/scarica", "", "")).toBeNull();
    browserDocument.cookie = "eb_consent=2%3Adenied%3Atest-receipt";
    expect(reportGa4PageView("/scarica", "", "")).toBeNull();
    expect(gtag).not.toHaveBeenCalled();

    browserDocument.cookie = "eb_consent=2%3Agranted%3Atest-receipt";
    expect(reportGa4PageView("/scarica", "", "")).not.toBeNull();
    expect(gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "page_view")).toEqual([["event", "page_view", {
      send_to: "G-TEST12345",
      page_path: "/scarica",
      page_location: "https://www.execlingo.it/scarica",
      page_referrer: "",
    }]]);
  });
});
