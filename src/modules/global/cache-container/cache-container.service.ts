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
   * set() ignores a numeric ttl (see set above). Every guess re-arms the
   * expiry, so an attacker who keeps hammering keeps the account locked.
   * Call clearGuesses(key) once the guess succeeds.
   */
  async countGuess(key: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (this.cacheManager.store as any).getClient();
    const count = await new Promise<number>((resolve, reject) =>
      client
        .multi()
        .incr(`guess_${key}`)
        .expire(`guess_${key}`, GUESS_LOCKOUT_MINUTES * 60)
        .exec((err: Error, replies: number[]) =>
          err ? reject(err) : resolve(replies[0]),
        ),
    );
    if (count > MAX_GUESSES)
      throw new HttpException(
        `Too many attempts. Please try again in ${GUESS_LOCKOUT_MINUTES} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  clearGuesses(key: string) {
    this.del(`guess_${key}`);
  }
}
