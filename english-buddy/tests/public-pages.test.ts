import { describe, expect, it } from "vitest";
import { isPublicPage, trackablePath } from "@/lib/public-pages";

/**
 * This list has cost conversions once already: the campaign landing page was
 * not on it, so every visitor bought through an advertisement met a
 * tap-to-start gate instead of the page the ad had promised.
 */
describe("isPublicPage", () => {
  it("covers every page a stranger can be sent to", () => {
    for (const path of ["/", "/inglese-lavoro", "/scarica", "/aziende", "/register", "/login", "/privacy", "/cookie", "/termini"]) {
      expect(isPublicPage(path), path).toBe(true);
    }
  });

  it("covers the parameterised public routes", () => {
    expect(isPublicPage("/reset/abc123")).toBe(true);
    expect(isPublicPage("/r/UMBERTO")).toBe(true);
  });

  it("leaves the signed-in app alone", () => {
    for (const path of ["/home", "/chat", "/progress", "/profile", "/admin", "/riunione", "/prepara"]) {
      expect(isPublicPage(path), path).toBe(false);
    }
  });
});

describe("trackablePath", () => {
  it("records a known page as itself", () => {
    expect(trackablePath("/inglese-lavoro")).toBe("/inglese-lavoro");
    expect(trackablePath("/")).toBe("/");
  });

  it("collapses the parameterised routes so one row does not become a thousand", () => {
    expect(trackablePath("/r/UMBERTO")).toBe("/r/:code");
    expect(trackablePath("/r/GIULIA")).toBe("/r/:code");
    expect(trackablePath("/reset/9f3a-token")).toBe("/reset/:token");
  });

  it("returns null inside the app, so product usage stays out of the traffic count", () => {
    expect(trackablePath("/home")).toBeNull();
    expect(trackablePath("/admin")).toBeNull();
  });
});
