import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("public store badge assets", () => {
  it.each([
    "/store-badges/app-store-it.svg",
    "/store-badges/google-play-it.svg",
  ])("lets unauthenticated visitors load %s", (pathname) => {
    const response = proxy(new NextRequest(`https://www.execlingo.it${pathname}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still rejects unknown public-looking assets", () => {
    const response = proxy(new NextRequest("https://www.execlingo.it/untrusted/file.svg"));

    expect(response.status).toBe(404);
  });
});
