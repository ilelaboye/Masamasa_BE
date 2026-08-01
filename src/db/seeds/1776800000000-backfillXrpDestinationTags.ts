import { User } from "@/modules/users/entities/user.entity";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import axios from "axios";
import { DataSource } from "typeorm";
import type { Seeder, SeederFactoryManager } from "typeorm-extension";
import { appConfig } from "@/config";
import type { QuidaxWallet } from "@/definitions";

function authHeader() {
  const key = appConfig.QUIDAX_API_KEY;
  if (!key) throw new Error("QUIDAX_API_KEY env var is not set");
  return { Authorization: `Bearer ${key}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getXrpWallet(quidaxUserId: string): Promise<QuidaxWallet> {
  const res = await axios.get<{ status: string; data: QuidaxWallet }>(
    `${appConfig.QUIDAX_BASE_URL}/users/${quidaxUserId}/wallets/xrp`,
    {
      headers: { ...authHeader(), "Content-Type": "application/json" },
      timeout: 15000,
    },
  );
  return res.data.data;
}

/**
 * Backfills every user's XRP wallet row with the destination_tag column.
 * XRP deposits share one master address on Quidax — the destination tag is
 * what routes a deposit to the right sub-account, so it must be stored
 * (and shown to the user) alongside the address.
 */
export class BackfillXrpDestinationTags1776800000000 implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    _factories: SeederFactoryManager,
  ): Promise<void> {
    const userRepo = dataSource.getRepository(User);
    const walletRepo = dataSource.getRepository(Wallet);

    const users = await userRepo
      .createQueryBuilder("user")
      .select(["user.id", "user.email", "user.quidax_id"])
      .where("user.quidax_id IS NOT NULL")
      .getMany();

    console.log(
      `[XrpTagBackfill] Checking XRP wallets for ${users.length} user(s)…`,
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        if (user.quidax_id) {
          const xrpWallet = await getXrpWallet(user.quidax_id);

          const address = xrpWallet?.deposit_address;
          const tag = xrpWallet?.destination_tag;

          if (!address) {
            console.log(
              `[XrpTagBackfill] user ${user.id} (${user.email}) — no XRP deposit address on Quidax, skipping`,
            );
            skipped++;
            continue;
          }

          const destinationTag = tag ?? null;

          const existing = await walletRepo
            .createQueryBuilder("wallet")
            .where("wallet.user_id = :userId", { userId: user.id })
            .andWhere("UPPER(wallet.currency) = 'XRP'")
            .getOne();

          if (existing) {
            if (
              existing.wallet_address === address &&
              (existing.destination_tag ?? null) === destinationTag
            ) {
              skipped++;
            } else {
              await walletRepo.update(
                { id: existing.id },
                {
                  wallet_address: address,
                  destination_tag: destinationTag,
                  type: WalletType.quidax,
                },
              );
              console.log(
                `[XrpTagBackfill] ✓ user ${user.id} → ${address} (tag: ${destinationTag ?? "none"})`,
              );
              updated++;
            }
          } else {
            await walletRepo.save({
              user_id: user.id,
              currency: "XRP",
              network: "RIPPLE",
              wallet_address: address,
              destination_tag: destinationTag,
              status: Status.active,
              type: WalletType.quidax,
            });
            console.log(
              `[XrpTagBackfill] ✓ user ${user.id} (created) → ${address} (tag: ${destinationTag ?? "none"})`,
            );
            updated++;
          }
        } else {
          console.log(
            `[XrpTagBackfill] User quidax_id is null for user ${user.id} (${user.email}), skipping`,
          );
        }
      } catch (err) {
        failed++;
        const message =
          err?.response?.data?.message ?? err?.message ?? String(err);
        console.error(
          `[XrpTagBackfill] ✗ user ${user.id} (${user.email}): ${message}`,
        );
      }

      // Respect Quidax's 10 req/s rate limit
      await sleep(120);
    }

    console.log(
      `[XrpTagBackfill] Done — ${updated} updated, ${skipped} skipped, ${failed} failed out of ${users.length}.`,
    );
  }
}
