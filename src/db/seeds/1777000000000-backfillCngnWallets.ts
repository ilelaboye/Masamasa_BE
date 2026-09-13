import { User } from "@/modules/users/entities/user.entity";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import axios from "axios";
import { DataSource } from "typeorm";
import type { Seeder, SeederFactoryManager } from "typeorm-extension";
import { appConfig } from "@/config";
import {
  QUIDAX_CURRENCIES,
  toAppNetwork,
} from "@/modules/quidax/quidax.constants";
import {
  CurrencyCoin,
  ExchangeRate,
  ExchangeRateStatus,
} from "@/modules/exchange-rates/exchange-rates.entity";
import type { QuidaxPaymentAddress } from "@/definitions";

function authHeader() {
  const key = appConfig.QUIDAX_API_KEY;
  if (!key) throw new Error("QUIDAX_API_KEY env var is not set");
  return { Authorization: `Bearer ${key}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Quidax rate limits — https://docs.quidax.io/docs/security ────────────────
// POST /users/:id/wallets/:currency/addresses is capped at 20 requests/second
// (every other endpoint is 300/minute). A breach answers with HTTP 444, and the
// docs ask callers to "build a retry mechanism around the 444 status codes".
//
// 80ms between calls is 12.5 req/s — deliberate headroom under the 20/s cap,
// since the limit is per account rather than per process: the wallet sweep
// cron may be calling Quidax while this seed runs.
const ADDRESS_DELAY_MS = 80;

// 444 is Quidax's documented rate-limit status; 429 covers their edge ever
// returning the conventional one.
const RATE_LIMIT_STATUSES = new Set([429, 444]);

/**
 * Retries only when Quidax rate-limits the call. Any other error rethrows on
 * the first attempt — a currency Quidax does not support must not burn four
 * backoffs per user — and exhausting the attempts rethrows the original error
 * so the caller still reports a real failure rather than a silent skip.
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      if (!RATE_LIMIT_STATUSES.has(status) || attempt >= attempts) throw err;
      // Quidax sends no Retry-After header, so back off blindly: 1s, 2s, 4s.
      const backoff = 1000 * 2 ** (attempt - 1);
      console.warn(
        `[CngnBackfill] rate limited (${status}) — retrying in ${backoff}ms (attempt ${attempt}/${attempts - 1})`,
      );
      await sleep(backoff);
    }
  }
}

async function createPaymentAddress(
  quidaxUserId: string,
  currency: string,
  network?: string,
): Promise<QuidaxPaymentAddress | null> {
  const query = network ? `?network=${network}` : "";
  const res = await withRateLimitRetry(() =>
    axios.post<{ status: string; data: QuidaxPaymentAddress }>(
      `${appConfig.QUIDAX_BASE_URL}/users/${quidaxUserId}/wallets/${currency}/addresses${query}`,
      {},
      {
        headers: { ...authHeader(), "Content-Type": "application/json" },
        timeout: 15000,
      },
    ),
  );
  console.log("createPaymentAddress resp", res.data);
  return res.data.data ?? null;
}

// The cNGN pairs as declared in QUIDAX_CURRENCIES — one source of truth, so
// adding a chain there is enough for this backfill to pick it up.
const CNGN_PAIRS = QUIDAX_CURRENCIES.filter((c) => c.currency === "cngn");

/**
 * Creates the cNGN deposit addresses for every existing user. New users get
 * them at registration (setupQuidaxAccount walks QUIDAX_CURRENCIES); everyone
 * who registered before cNGN was accepted needs this one-off pass.
 *
 * Idempotent — a user who already has a row for a pair is skipped, so it is
 * safe to re-run after a partial failure:
 *   npm run build && npx typeorm-extension seed:run \
 *     -d ./dist/config/typeorm.config.js -n BackfillCngnWallets1777000000000
 */
export class BackfillCngnWallets1777000000000 implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    _factories: SeederFactoryManager,
  ): Promise<void> {
    const userRepo = dataSource.getRepository(User);
    const walletRepo = dataSource.getRepository(Wallet);

    await this.ensureCngnRate(dataSource);

    const users = await userRepo
      .createQueryBuilder("user")
      .select(["user.id", "user.email", "user.quidax_id"])
      .where("user.quidax_id IS NOT NULL")
      .getMany();

    console.log(
      `[CngnBackfill] Checking ${CNGN_PAIRS.length} cNGN wallet(s) for ${users.length} user(s)…`,
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      for (const { currency, network } of CNGN_PAIRS) {
        const appNetwork = toAppNetwork(network ?? null, currency);

        const existing = await walletRepo
          .createQueryBuilder("wallet")
          .where("wallet.user_id = :userId", { userId: user.id })
          .andWhere("UPPER(wallet.currency) = :currency", {
            currency: currency.toUpperCase(),
          })
          .andWhere("UPPER(wallet.network) = :network", {
            network: appNetwork.toUpperCase(),
          })
          .getOne();

        if (existing) {
          skipped++;
          continue;
        }

        try {
          const addr = await createPaymentAddress(
            user.quidax_id as string,
            currency,
            network,
          );

          if (!addr?.address) {
            // Quidax mints some addresses asynchronously — re-running the
            // seed later picks them up.
            console.log(
              `[CngnBackfill] user ${user.id} (${user.email}) ${appNetwork} — no address yet, retry later`,
            );
            failed++;
          } else {
            await walletRepo.save({
              user_id: user.id,
              currency: currency.toUpperCase(),
              network: appNetwork,
              wallet_address: addr.address,
              destination_tag: addr.destination_tag ?? null,
              status: Status.active,
              type: WalletType.quidax,
            });
            console.log(
              `[CngnBackfill] ✓ user ${user.id} ${appNetwork} → ${addr.address}`,
            );
            created++;
          }
        } catch (err) {
          failed++;
          const message =
            err?.response?.data?.message ?? err?.message ?? String(err);
          console.error(
            `[CngnBackfill] ✗ user ${user.id} (${user.email}) ${appNetwork}: ${message}`,
          );
        }

        // Stay under Quidax's 20 req/s cap on address creation
        await sleep(ADDRESS_DELAY_MS);
      }
    }

    console.log(
      `[CngnBackfill] Done — ${created} created, ${skipped} already present, ${failed} failed.`,
    );
  }

  /**
   * The cNGN row holds the naira price of one coin, and deposits are credited
   * as `coin_amount * rate` — a missing row would credit ₦0. It seeds at the
   * old ₦1 peg; the live price is the admin's to set in the dashboard.
   */
  private async ensureCngnRate(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(ExchangeRate);

    const existing = await repo.findOne({
      where: {
        currency: CurrencyCoin.cngn,
        status: ExchangeRateStatus.active,
      },
    });
    if (existing) return;

    const usdt = await repo.findOne({
      where: {
        currency: CurrencyCoin.usdt,
        status: ExchangeRateStatus.active,
      },
    });
    if (!usdt) {
      console.warn(
        "[CngnBackfill] No active USDT rate to copy — set the cNGN rate in the admin dashboard before going live.",
      );
      return;
    }

    await repo.save({
      admin_id: usdt.admin_id,
      currency: CurrencyCoin.cngn,
      rate: 1,
      status: ExchangeRateStatus.active,
    });
    console.log("[CngnBackfill] Seeded cNGN exchange rate at ₦1 per coin.");
  }
}
