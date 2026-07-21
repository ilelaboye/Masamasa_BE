import { User } from "@/modules/users/entities/user.entity";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import axios from "axios";
import { DataSource, In } from "typeorm";
import type { Seeder, SeederFactoryManager } from "typeorm-extension";
import {
  QUIDAX_CURRENCIES,
  toAppNetwork,
} from "@/modules/quidax/quidax.constants";
import { appConfig } from "@/config";
import type { QuidaxPaymentAddress } from "@/definitions";

function authHeader() {
  const key = appConfig.QUIDAX_API_KEY;
  if (!key) throw new Error("QUIDAX_SECRET_KEY env var is not set");
  return { Authorization: `Bearer ${key}` };
}

async function quidaxPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  try {
    const res = await axios.post<{ status: string; data: T }>(
      `${appConfig.QUIDAX_BASE_URL}${path}`,
      body,
      {
        headers: { ...authHeader(), "Content-Type": "application/json" },
        timeout: 15000,
      },
    );
    console.log("q res", res.data);
    return res.data.data;
  } catch (err) {
    console.log("eee", err);
    return err;
  }
}

async function createSubAccount(user: User): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    email: `quidax7+${user.email}`,
    first_name: user.first_name,
    last_name: user.last_name,
  };
  // if (user.phone) payload.phone_number = user.phone;
  return quidaxPost<{ id: string }>("/users", payload);
}

async function createAllPaymentAddresses(quidaxUserId: string): Promise<{
  results: QuidaxPaymentAddress[];
  unsupported: Array<{ currency: string; network?: string }>;
}> {
  const results: QuidaxPaymentAddress[] = [];
  const unsupported: Array<{ currency: string; network?: string }> = [];

  for (const { currency, network } of QUIDAX_CURRENCIES) {
    const query = network ? `?network=${network}` : "";
    const url = `${appConfig.QUIDAX_BASE_URL}/users/${quidaxUserId}/wallets/${currency}/addresses${query}`;
    console.log(url);
    try {
      const r = await axios.post<{
        status: string;
        data: QuidaxPaymentAddress;
      }>(
        url,
        {},
        {
          headers: { ...authHeader(), "Content-Type": "application/json" },
          timeout: 15000,
        },
      );
      console.log("createAllPaymentAdd result", r.data);
      results.push(r.data.data);
    } catch (err) {
      const msg: string =
        err?.response?.data?.message ?? err?.message ?? String(err);
      if (msg.toLowerCase().includes("blockchain deposits are not available")) {
        console.log(
          `[QuidaxBackfill] ${currency}${network ? `/${network}` : ""} not supported by Quidax — will use self-custodian EVM address`,
        );
        unsupported.push({ currency, network });
      } else {
        console.error(
          `[QuidaxBackfill] address creation failed for ${currency}${network ? `/${network}` : ""}: ${msg}`,
        );
      }
    }

    // Respect the 10 req/s rate limit with a small gap between calls
    await sleep(120);
  }

  return { results, unsupported };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BackfillQuidaxSubAccounts1776100000000 implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    _factories: SeederFactoryManager,
  ): Promise<void> {
    const walletRepo = dataSource.getRepository(Wallet);
    const disabled = await walletRepo
      .createQueryBuilder()
      .update(Wallet)
      .set({ status: Status.disabled })
      .where("status = :status", { status: Status.active })
      .execute();
    console.log(
      `[QuidaxBackfill] Disabled ${disabled.affected ?? 0} existing wallet address(es).`,
    );

    const userRepo = dataSource.getRepository(User);
    const users = await userRepo
      .createQueryBuilder("user")
      .where("user.quidax_id IS NULL")
      .select([
        "user.id",
        "user.email",
        "user.first_name",
        "user.last_name",
        "user.phone",
      ])
      .getMany();
    if (!users.length) {
      console.log(
        "[QuidaxBackfill] All users already have a quidax_id — nothing to do.",
      );
      return;
    }
    console.log(
      `[QuidaxBackfill] Found ${users.length} user(s) without a quidax_id. Starting backfill…`,
    );
    let succeeded = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const quidaxUser = await createSubAccount(user);
        await userRepo.update({ id: user.id }, { quidax_id: quidaxUser.id });

        const { results: addresses, unsupported } =
          await createAllPaymentAddresses(quidaxUser.id);
        for (const addr of addresses) {
          if (!addr.address) {
            console.log(
              `[QuidaxBackfill] user ${user.id} (${user.email}) → ${addr.currency} / ${addr.network} → null address (will be filled by webhook)`,
            );
            continue;
          }
          const appNetwork = toAppNetwork(addr.network, addr.currency);
          console.log(
            `[QuidaxBackfill] user → ${addr.currency} / ${appNetwork} → ${addr.address}`,
          );
          const exists = await walletRepo.findOne({
            where: {
              user_id: user.id,
              network: appNetwork,
              currency: addr.currency,
            },
          });
          if (exists) {
            await walletRepo.update(
              { id: exists.id },
              {
                wallet_address: addr.address,
                status: Status.active,
                type: WalletType.quidax,
              },
            );
          } else {
            try {
              await walletRepo.save({
                user_id: user.id,
                currency: addr.currency,
                network: appNetwork,
                wallet_address: addr.address,
                status: Status.active,
                type: WalletType.quidax,
              });
            } catch (saveErr) {
              console.error(
                `[QuidaxBackfill]   FAILED  ${addr.currency}/${appNetwork} → ${addr.address}: ${saveErr?.message}`,
              );
            }
          }
        }

        // For pairs Quidax doesn't support (all EVM-compatible tokens),
        // reuse the user's existing EVM address from the Quidax-generated wallets.
        // if (unsupported.length > 0) {
        //   const evmWallet = await walletRepo.findOne({
        //     where: {
        //       user_id: user.id,
        //       network: In(["ETHEREUM", "BINANCE", "BASE"]),
        //       type: WalletType.quidax,
        //     },
        //   });
        //   if (evmWallet) {
        //     console.log(
        //       `[QuidaxBackfill] Using EVM address ${evmWallet.wallet_address} for ${unsupported.length} self-custodian pair(s)`,
        //     );
        //     for (const { currency, network } of unsupported) {
        //       const appNetwork = toAppNetwork(network ?? null, currency);
        //       const exists = await walletRepo.findOne({
        //         where: { user_id: user.id, network: appNetwork, currency },
        //       });
        //       if (exists) {
        //         await walletRepo.update(
        //           { id: exists.id },
        //           {
        //             wallet_address: evmWallet.wallet_address,
        //             status: Status.active,
        //             type: WalletType.self_custodian,
        //           },
        //         );
        //       } else {
        //         try {
        //           await walletRepo.save({
        //             user_id: user.id,
        //             currency,
        //             network: appNetwork,
        //             wallet_address: evmWallet.wallet_address,
        //             status: Status.active,
        //             type: WalletType.self_custodian,
        //           });
        //           console.log(
        //             `[QuidaxBackfill] ✓ self-custodian ${currency}/${appNetwork} → ${evmWallet.wallet_address}`,
        //           );
        //         } catch (saveErr) {
        //           console.error(
        //             `[QuidaxBackfill]   FAILED self-custodian ${currency}/${appNetwork}: ${saveErr?.message}`,
        //           );
        //         }
        //       }
        //     }
        //   } else {
        //     console.log(
        //       `[QuidaxBackfill] No EVM wallet found for user ${user.id} — skipping ${unsupported.length} self-custodian pair(s)`,
        //     );
        //   }
        // }

        console.log("unsupported", unsupported);

        succeeded++;
      } catch (err) {
        const message =
          err?.response?.data?.message ?? err?.message ?? String(err);
        console.error(
          `[QuidaxBackfill] ✗ user ${user.id} (${user.email}): ${message}`,
        );
        failed++;
      }
      // 300 ms between users to avoid Quidax rate-limit bursts
      await sleep(300);
    }
    console.log(
      `[QuidaxBackfill] Done — ${succeeded} succeeded, ${failed} failed out of ${users.length} total.`,
    );
  }
}
