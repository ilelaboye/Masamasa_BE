import { User } from "@/modules/users/entities/user.entity";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import axios from "axios";
import { DataSource } from "typeorm";
import type { Seeder, SeederFactoryManager } from "typeorm-extension";
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
  const payload = {
    email: `quidax7+${user.email}`,
    first_name: user.first_name,
    last_name: user.last_name,
  };
  console.log(
    `[UsdtTronBackfill] creating sub-account for user ${user.id} (${user.email})`,
  );
  const res = await axios.post<{ status: string; data: { id: string } }>(
    `${appConfig.QUIDAX_BASE_URL}/users`,
    payload,
    {
      headers: { ...authHeader(), "Content-Type": "application/json" },
      timeout: 15000,
    },
  );
  console.log(`[UsdtTronBackfill] sub-account response`, res.data);
  return res.data.data;
}

export class BackfillUsdtTronAddresses1776500000000 implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    _factories: SeederFactoryManager,
  ): Promise<void> {
    const userRepo = dataSource.getRepository(User);
    const walletRepo = dataSource.getRepository(Wallet);

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

    if (!users.length) {
      console.log("[UsdtTronBackfill] No users found — nothing to do.");
      return;
    }

    console.log(
      `[UsdtTronBackfill] Found ${users.length} user(s). Starting USDT/TRC20 backfill…`,
    );

    let succeeded = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Create Quidax sub-account if the user doesn't have one yet
        if (!user.quidax_id) {
          console.log(
            `[UsdtTronBackfill] user ${user.id} (${user.email}) has no quidax_id — creating sub-account`,
          );
          const quidaxUser = await createSubAccount(user);
          await userRepo.update({ id: user.id }, { quidax_id: quidaxUser.id });
          user.quidax_id = quidaxUser.id;
          console.log(
            `[UsdtTronBackfill] user ${user.id} → quidax_id: ${quidaxUser.id}`,
          );
          await sleep(300);
        }

        // Generate USDT/TRC20 address
        const url = `${appConfig.QUIDAX_BASE_URL}/users/${user.quidax_id}/wallets/usdt/addresses?network=trc20`;
        console.log(`[UsdtTronBackfill] POST ${url}`);

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
        console.log(`[UsdtTronBackfill] response`, r.data);

        const addr = r.data.data;
        if (!addr.address) {
          console.log(
            `[UsdtTronBackfill] user ${user.id} (${user.email}) → null address returned, skipping`,
          );
          succeeded++;
          await sleep(120);
          continue;
        }

        console.log(
          `[UsdtTronBackfill] user ${user.id} (${user.email}) → ${addr.address}`,
        );

        const existing = await walletRepo.findOne({
          where: { user_id: user.id, network: "TRON", currency: "usdt" },
        });

        if (existing) {
          await walletRepo.update(
            { id: existing.id },
            { wallet_address: addr.address, status: Status.active },
          );
          console.log(
            `[UsdtTronBackfill] ✓ updated user ${user.id} wallet id=${existing.id} → ${addr.address}`,
          );
        } else {
          await walletRepo.save({
            user_id: user.id,
            currency: "usdt",
            network: "TRON",
            wallet_address: addr.address,
            type: WalletType.quidax,
            status: Status.active,
          });
          console.log(
            `[UsdtTronBackfill] ✓ created user ${user.id} USDT/TRON → ${addr.address}`,
          );
        }

        succeeded++;
      } catch (err) {
        const msg = err?.response?.data?.message ?? err?.message ?? String(err);
        console.error(
          `[UsdtTronBackfill] ✗ user ${user.id} (${user.email}): ${msg}`,
        );
        failed++;
      }

      // 120 ms gap to stay within the 10 req/s Quidax rate limit
      await sleep(120);
    }

    console.log(
      `[UsdtTronBackfill] Done — ${succeeded} succeeded, ${failed} failed out of ${users.length} total.`,
    );
  }
}
