/* eslint-disable @typescript-eslint/no-explicit-any -- getPrices touches no
   injected provider, so the service is built with none. */
import axios from "axios";
import { PublicService } from "./public.service";

jest.mock("axios");

// The mobile app casts usd/change_24h with `as num`; a null from CoinGecko
// throws there and fails login.
describe("getPrices", () => {
  it("never returns null numbers", async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: [
        {
          id: "compliant-naira",
          current_price: 0.00073,
          price_change_percentage_24h: null,
        },
        {
          id: "bitcoin",
          current_price: null,
          price_change_percentage_24h: -1.2,
        },
      ],
    });

    const { data } = (await new (PublicService as any)().getPrices()) as any;

    expect(data.cngn).toEqual({ usd: 0.00073, change_24h: 0, direction: "up" });
    expect(data.bitcoin).toEqual({
      usd: 0,
      change_24h: -1.2,
      direction: "down",
    });
  });
});
