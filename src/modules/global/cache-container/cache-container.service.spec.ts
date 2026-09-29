/* eslint-disable @typescript-eslint/no-explicit-any -- a stand-in for the
   redis@3 client: just enough of multi().set().incr().ttl().exec(). */
import { GUESS_LOCKOUT_MINUTES, MAX_GUESSES } from "@/constants";
import { CacheService } from "./cache-container.service";

// Keys expire against a clock the test moves, as Redis would.
const fakeCache = () => {
  const clock = { now: 0 };
  const keys = new Map<string, { value: number; expiresAt: number }>();
  const live = (k: string) => {
    const e = keys.get(k);
    if (e && e.expiresAt <= clock.now) keys.delete(k);
    return keys.get(k);
  };
  const client = {
    multi: () => {
      const ops: (() => unknown)[] = [];
      const chain: any = {
        set: (k: string, v: number, _ex: string, secs: number, nx: string) => {
          ops.push(() => {
            if (nx === "NX" && live(k)) return null;
            keys.set(k, { value: v, expiresAt: clock.now + secs * 1000 });
            return "OK";
          });
          return chain;
        },
        incr: (k: string) => {
          ops.push(() => ++live(k)!.value);
          return chain;
        },
        ttl: (k: string) => {
          ops.push(() => Math.ceil((live(k)!.expiresAt - clock.now) / 1000));
          return chain;
        },
        exec: (cb: any) =>
          cb(
            null,
            ops.map((op) => op()),
          ),
      };
      return chain;
    },
  };
  const manager = {
    store: { getClient: () => client },
    del: (k: string) => keys.delete(k),
  } as any;
  return { cache: new CacheService(manager), clock };
};

const guessTimes = async (cache: CacheService, n: number) => {
  for (let i = 0; i < n; i++) await cache.countGuess("pin_1", "PIN");
};

// A lockout that never trips, or that trips on a correct guess, is the
// difference between a 4-digit PIN and no PIN.
describe("countGuess", () => {
  it("allows MAX_GUESSES, then refuses with 429 naming the secret", async () => {
    const { cache } = fakeCache();
    await guessTimes(cache, MAX_GUESSES);
    await expect(cache.countGuess("pin_1", "PIN")).rejects.toMatchObject({
      status: 429,
      message: `Too many incorrect PIN attempts. Please try again in ${GUESS_LOCKOUT_MINUTES} minutes.`,
    });
  });

  it("counts each account separately", async () => {
    const { cache } = fakeCache();
    await guessTimes(cache, MAX_GUESSES);
    await expect(cache.countGuess("pin_2", "PIN")).resolves.toBeUndefined();
  });

  it("starts over once a guess succeeds", async () => {
    const { cache } = fakeCache();
    await guessTimes(cache, MAX_GUESSES);
    cache.clearGuesses("pin_1");
    await expect(cache.countGuess("pin_1", "PIN")).resolves.toBeUndefined();
  });

  // Re-arming on every guess kept a user who retried while locked out
  // locked out indefinitely.
  it("unlocks when the window that began with the first guess ends", async () => {
    const { cache, clock } = fakeCache();
    await guessTimes(cache, MAX_GUESSES);

    clock.now = (GUESS_LOCKOUT_MINUTES - 1) * 60_000;
    await expect(cache.countGuess("pin_1", "PIN")).rejects.toMatchObject({
      message: "Too many incorrect PIN attempts. Please try again in 1 minute.",
    });

    clock.now = GUESS_LOCKOUT_MINUTES * 60_000;
    await expect(cache.countGuess("pin_1", "PIN")).resolves.toBeUndefined();
  });
});
