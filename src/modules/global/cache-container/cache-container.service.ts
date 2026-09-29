import { GUESS_LOCKOUT_MINUTES, MAX_GUESSES } from "@/constants";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string) {
    return await this.cacheManager.get<T>(key);
  }

  set(key: string, value: unknown, ttl?: number) {
    this.cacheManager.set(key, value, ttl); //ttl not working
  }

  del(key: string) {
    this.cacheManager.del(key);
  }

  clear() {
    this.cacheManager.reset();
  }

  /**
   * Counts one guess at a secret (password, PIN, emailed code) and throws 429
   * once `key` has taken more than MAX_GUESSES inside the lockout window.
   *
   * Counted *before* the guess is checked, with Redis INCR, so a burst of
   * parallel requests cannot all read the same count and slip under the
   * limit — a get-then-set would. Goes to the raw client because the store's
   * set() ignores a numeric ttl (see set above).
   *
   * The window is fixed from the first guess (SET NX starts it, nothing
   * extends it). Re-arming it on every guess only kept real users who retried
   * while locked out locked out for good; an attacker just paces guesses.
   * Call clearGuesses(key) once the guess succeeds.
   *
   * `what` names the secret in the error ("PIN", "password", "code"): the PIN
   * screen follows login, so a bare "too many attempts" reads as a failed
   * sign-in.
   */
  async countGuess(key: string, what: string) {
    const k = `guess_${key}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (this.cacheManager.store as any).getClient();
    const [, count, ttl] = await new Promise<number[]>((resolve, reject) =>
      client
        .multi()
        .set(k, 0, "EX", GUESS_LOCKOUT_MINUTES * 60, "NX")
        .incr(k)
        .ttl(k)
        .exec((err: Error, replies: number[]) =>
          err ? reject(err) : resolve(replies),
        ),
    );
    if (count > MAX_GUESSES) {
      const minutes = Math.max(1, Math.ceil(ttl / 60));
      throw new HttpException(
        `Too many incorrect ${what} attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  clearGuesses(key: string) {
    this.del(`guess_${key}`);
  }
}
