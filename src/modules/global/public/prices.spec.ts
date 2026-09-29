/* eslint-disable @typescript-eslint/no-explicit-any -- the pricing paths touch
   only the cache, so the service is built with that one provider. */
import axios from "axios";
import { PublicService } from "./public.service";

jest.mock("axios");
const get = axios.get as jest.Mock;

const serviceWithCache = () => {
  const store = new Map<string, unknown>();
  const cacheService = {
    get: async (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  };
  const providers = Array(12).fill(null);
  providers[9] = cacheService;
  return {
    service: new (PublicService as any)(...providers) as PublicService,
    store,
  };
};

const market = (
  id: string,
  price: number | null,
  change: number | null = 1,
) => ({
  id,
  current_price: price,
  price_change_percentage_24h: change,
});

beforeEach(() => get.mockReset());

// The mobile app casts usd/change_24h with `as num`; a null from CoinGecko
// throws there and fails login.
describe("getPrices", () => {
  it("never returns null numbers", async () => {
    get.mockResolvedValue({
      data: [
        market("compliant-naira", 0.00073, null),
        market("bitcoin", null, -1.2),
      ],
    });

    const { data } = (await serviceWithCache().service.getPrices()) as any;

    expect(data.cngn).toEqual({ usd: 0.00073, change_24h: 0, direction: "up" });
    expect(data.bitcoin).toEqual({
      usd: 0,
      change_24h: -1.2,
      direction: "down",
    });
  });

  // Uncached, every login hit CoinGecko and got the server's IP blocked.
  it("calls CoinGecko once while the cache is fresh", async () => {
    get.mockResolvedValue({ data: [market("bitcoin", 60000)] });
    const { service } = serviceWithCache();

    await Promise.all([service.getPrices(), service.getPrices()]);
    await service.getPrices();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves the last prices when CoinGecko fails", async () => {
    const { service, store } = serviceWithCache();
    store.set("COINGECKO_PRICES", {
      at: 0, // long expired
      data: { bitcoin: { usd: 60000, change_24h: 1, direction: "up" } },
    });
    get.mockRejectedValue(new Error("429"));

    const { data } = (await service.getPrices()) as any;
    expect(data.bitcoin.usd).toBe(60000);
  });
});

// Deposits are credited off this price; a wrong coin is a wrong credit.
describe("getPrice", () => {
  it("prices a deposit ticker off the cached feed", async () => {
    get.mockResolvedValue({
      data: [market("tron", 0.3), market("polygon-ecosystem-token", 0.2)],
    });
    const { service } = serviceWithCache();

    expect(await service.getPrice("TRX")).toEqual({ status: true, price: 0.3 });
    expect(await service.getPrice("MATIC")).toEqual({
      status: true,
      price: 0.2,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reports a missing price as unavailable, not as 0", async () => {
    get.mockResolvedValue({ data: [market("bitcoin", null)] });
    const { service } = serviceWithCache();

    expect(await service.getPrice("BTC")).toEqual({
      status: false,
      price: null,
    });
  });
});
