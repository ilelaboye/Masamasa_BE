/* eslint-disable @typescript-eslint/no-explicit-any -- a stand-in for the
   redis@3 client: just enough of multi().incr().expire().exec(). */
import { MAX_GUESSES } from "@/constants";
import { CacheService } from "./cache-container.service";

const fakeCache = () => {
  const counts = new Map<string, number>();
  const client = {
    multi: () => {
      let key: string;
      const chain: any = {
        incr: (k: string) => ((key = k), chain),
        expire: () => chain,
        exec: (cb: any) => {
          counts.set(key, (counts.get(key) ?? 0) + 1);
          cb(null, [counts.get(key), 1]);
        },
      };
      return chain;
    },
  };
  return {
    store: { getClient: () => client },
    del: (k: string) => counts.delete(k),
  } as any;
};

// A lockout that never trips, or that trips on a correct guess, is the
// difference between a 4-digit PIN and no PIN.
describe("countGuess", () => {
  it("allows MAX_GUESSES, then refuses with 429", async () => {
    const cache = new CacheService(fakeCache());
    for (let i = 0; i < MAX_GUESSES; i++) await cache.countGuess("pin_1");
    await expect(cache.countGuess("pin_1")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("counts each account separately", async () => {
    const cache = new CacheService(fakeCache());
    for (let i = 0; i < MAX_GUESSES; i++) await cache.countGuess("pin_1");
    await expect(cache.countGuess("pin_2")).resolves.toBeUndefined();
  });

  it("starts over once a guess succeeds", async () => {
    const cache = new CacheService(fakeCache());
    for (let i = 0; i < MAX_GUESSES; i++) await cache.countGuess("pin_1");
    cache.clearGuesses("pin_1");
    await expect(cache.countGuess("pin_1")).resolves.toBeUndefined();
  });
});
