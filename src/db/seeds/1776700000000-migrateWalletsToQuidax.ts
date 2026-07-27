import { User } from "@/modules/users/entities/user.entity";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import axios from "axios";
import { DataSource } from "typeorm";
import type { Seeder, SeederFactoryManager } from "typeorm-extension";
import {
  QUIDAX_CURRENCIES,
  SUPPORTED_WALLET_PAIRS,
  toAppNetwork,
} from "@/modules/quidax/quidax.constants";
import { appConfig } from "@/config";
import type { QuidaxPaymentAddress } from "@/definitions";

function authHeader() {
  const key = appConfig.QUIDAX_API_KEY;
  if (!key) throw new Error("QUIDAX_API_KEY env var is not set");
  return { Authorization: `Bearer ${key}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createSubAccount(user: User): Promise<{ id: string }> {
  const res = await axios.post<{ status: string; data: { id: string } }>(
    `${appConfig.QUIDAX_BASE_URL}/users`,
    {
      email: `quidax01+${user.email}`,
      first_name: user.first_name,
      last_name: user.last_name,
    },
    {
      headers: { ...authHeader(), "Content-Type": "application/json" },
      timeout: 15000,
    },
  );
  return res.data.data;
}

async function createPaymentAddress(
  quidaxUserId: string,
  currency: string,
  network?: string,
): Promise<QuidaxPaymentAddress | null> {
  const query = network ? `?network=${network}` : "";
  try {
    const res = await axios.post<{
      status: string;
      data: QuidaxPaymentAddress;
    }>(
      `${appConfig.QUIDAX_BASE_URL}/users/${quidaxUserId}/wallets/${currency}/addresses${query}`,
      {},
      {
        headers: { ...authHeader(), "Content-Type": "application/json" },
        timeout: 15000,
      },
    );
    return res.data.data;
  } catch (err) {
    const msg: string =
      err?.response?.data?.message ?? err?.message ?? String(err);
    console.error(
      `[QuidaxWalletMigration] address creation failed for ${currency}${network ? `/${network}` : ""}: ${msg}`,
    );
    return null;
  }
}

/**
 * Migrates every user to Quidax-generated wallets:
 *  1. Deletes wallet rows whose currency/network pair Quidax does not support.
 *  2. Ensures the user has a Quidax sub-account (quidax_id).
 *  3. Creates a deposit address for every accepted pair and upserts the
 *     wallet row (existing rows are re-pointed to the Quidax address).
 */
export class MigrateWalletsToQuidax1776700000000 implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    _factories: SeederFactoryManager,
  ): Promise<void> {
    const userRepo = dataSource.getRepository(User);
    const walletRepo = dataSource.getRepository(Wallet);

    // 1. Remove unsupported currency/network rows for ALL users in one pass.
    const allWallets = await walletRepo.find();
    const unsupported = allWallets.filter(
      (w) =>
        !SUPPORTED_WALLET_PAIRS.has(
          `${(w.currency ?? "").toUpperCase()}|${(w.network ?? "").toUpperCase()}`,
        ),
    );
    if (unsupported.length) {
      await walletRepo.delete(unsupported.map((w) => w.id));
      console.log(
        `[QuidaxWalletMigration] Removed ${unsupported.length} unsupported wallet row(s).`,
      );
    }

    // 2 & 3. Provision Quidax sub-accounts + addresses per user.
    const users = await userRepo
      .createQueryBuilder("user")
      .select([
        "user.id",
        "user.email",
        "user.first_name",
        "user.last_name",
        "user.quidax_id",
      ])
      .getMany();

    console.log(
      `[QuidaxWalletMigration] Provisioning wallets for ${users.length} user(s)…`,
    );

    let succeeded = 0;
    let failed = 0;

    for (const user of users) {
      try {
        let quidaxId = user.quidax_id;
        if (!quidaxId) {
          const quidaxUser = await createSubAccount(user);
          quidaxId = quidaxUser.id;
          await userRepo.update({ id: user.id }, { quidax_id: quidaxId });
        }

        const userWallets = await walletRepo.find({
          where: { user_id: user.id },
        });

        for (const { currency, network } of QUIDAX_CURRENCIES) {
          const appNetwork = toAppNetwork(network ?? null, currency);

          const addr = await createPaymentAddress(quidaxId, currency, network);
          // Respect Quidax's 10 req/s rate limit
          await sleep(120);

          if (!addr?.address) continue;

          const existing = userWallets.find(
            (w) =>
              (w.currency ?? "").toUpperCase() === currency.toUpperCase() &&
              (w.network ?? "").toUpperCase() === appNetwork.toUpperCase(),
          );

          if (existing) {
            await walletRepo.update(
              { id: existing.id },
              {
                wallet_address: addr.address,
                currency: currency.toUpperCase(),
                network: appNetwork,
                status: Status.active,
                type: WalletType.quidax,
              },
            );
          } else {
            await walletRepo.save({
              user_id: user.id,
              currency: currency.toUpperCase(),
              network: appNetwork,
              wallet_address: addr.address,
              status: Status.active,
              type: WalletType.quidax,
            });
          }
        }

        succeeded++;
        console.log(
          `[QuidaxWalletMigration] ✓ user ${user.id} (${user.email})`,
        );
      } catch (err) {
        failed++;
        const message =
          err?.response?.data?.message ?? err?.message ?? String(err);
        console.error(
          `[QuidaxWalletMigration] ✗ user ${user.id} (${user.email}): ${message}`,
        );
      }

      // Small gap between users to avoid rate-limit bursts
      await sleep(300);
    }

    console.log(
      `[QuidaxWalletMigration] Done — ${succeeded} succeeded, ${failed} failed out of ${users.length}.`,
    );
  }
}
