import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StripePrice = {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
};

function mockExistingPrice(price: StripePrice) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return Response.json({ data: [price] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("catalogo prezzi Stripe", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["importo", { id: "price_wrong_amount", unit_amount: 19_999, currency: "eur", recurring: { interval: "year", interval_count: 1 } }],
    ["valuta", { id: "price_wrong_currency", unit_amount: 19_900, currency: "usd", recurring: { interval: "year", interval_count: 1 } }],
    ["intervallo", { id: "price_wrong_interval", unit_amount: 19_900, currency: "eur", recurring: { interval: "month", interval_count: 1 } }],
    ["numero di intervalli", { id: "price_wrong_count", unit_amount: 19_900, currency: "eur", recurring: { interval: "year", interval_count: 2 } }],
  ] satisfies Array<[string, StripePrice]>) (
    "rifiuta il Price annuale esistente con %s errato",
    async (_field, price) => {
      const fetchMock = mockExistingPrice(price);
      const { ensurePriceId } = await import("@/lib/stripe");

      await expect(ensurePriceId("annual")).rejects.toThrow(
        "Stripe price execlingo_annual does not match the published ExecLingo plan",
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("accetta soltanto il Price annuale esatto da 199 euro, EUR, ogni anno", async () => {
    const fetchMock = mockExistingPrice({
      id: "price_annual_exact",
      unit_amount: 19_900,
      currency: "eur",
      recurring: { interval: "year", interval_count: 1 },
    });
    const { ensurePriceId } = await import("@/lib/stripe");

    await expect(ensurePriceId("annual")).resolves.toBe("price_annual_exact");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("lookup_keys[]=execlingo_annual");
  });
});
