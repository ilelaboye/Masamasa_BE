/* eslint-disable @typescript-eslint/no-explicit-any -- the double below stands
   in for twelve injected providers; only the rate lookup is exercised. */
import { PublicService } from "./public.service";

// cNGN is quoted in naira: its exchange_rates row holds the naira price of one
// coin. These cover the two things that would misprice a deposit — the naira
// leg being routed through the dollar rate instead of read off the row, and a
// missing USDT rate dragging that naira leg to zero with it.

const serviceFor = (rates: Record<string, number>) => {
  const exchangeRateService = {
    getCurrencyActiveRate: async (currency: string) =>
      rates[currency] === undefined ? null : { id: 1, rate: rates[currency] },
  };
  const providers = Array(12).fill(null);
  providers[5] = exchangeRateService;
  return new (PublicService as any)(...providers) as PublicService;
};

const pricing = (service: PublicService, currency: string, rate: number) =>
  (service as any).getCoinPricing(currency, rate) as Promise<{
    coinPrice: number;
    nairaPerCoin: number;
  }>;

describe("cNGN pricing", () => {
  it("credits naira straight off the cNGN rate", async () => {
    const { nairaPerCoin } = await pricing(
      serviceFor({ cngn: 1.05, usdt: 1600 }),
      "cngn",
      1.05,
    );

    // Exact: 250 coins at ₦1.05. A dollar round trip would land just off it.
    expect(250 * nairaPerCoin).toBe(262.5);
  });

  it("reports the dollar value through the USDT rate", async () => {
    const { coinPrice } = await pricing(
      serviceFor({ cngn: 1.05, usdt: 1600 }),
      "cngn",
      1.05,
    );

    expect(coinPrice).toBeCloseTo(1.05 / 1600, 12);
  });

  it("still credits naira when the USDT rate is missing", async () => {
    const { coinPrice, nairaPerCoin } = await pricing(
      serviceFor({ cngn: 1.05 }),
      "cngn",
      1.05,
    );

    expect(nairaPerCoin).toBe(1.05);
    expect(coinPrice).toBe(0);
  });
});
