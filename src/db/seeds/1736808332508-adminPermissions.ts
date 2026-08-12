import { hashResourceSync } from "@/core/utils";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import {
  CurrencyCoin,
  ExchangeRate,
  ExchangeRateStatus,
} from "@/modules/exchange-rates/exchange-rates.entity";
import { DataSource } from "typeorm";
import type { Seeder } from "typeorm-extension";

export class AdminPermissions1736808332508 implements Seeder {
  track = false;

  public async run(dataSource: DataSource): Promise<any> {
    const admin = dataSource.getRepository(Administrator);

    const admins = [
      {
        first_name: "Lekan",
        last_name: "Ilelaboye",
        email: "ilelaboyealekan@gmail.com",
        password: "Password@123",
      },
      {
        first_name: "Bukola",
        last_name: "Adesoye",
        email: "kadebukolaadesoye@gmail.com",
        password: "Password@123",
      },
      // {
      //   first_name: "Loveth",
      //   last_name: "Adetunji",
      //   email: "loveth@masamasa.ng",
      //   password: "lovetha@123",
      // },
      // {
      //   first_name: "Seyi",
      //   last_name: "Olugbeko",
      //   email: "seyi@masamasa.ng",
      //   password: "seyio@123",
      // },
      // {
      //   first_name: "Pelumi",
      //   last_name: "Ayandoye",
      //   email: "pelumi@masamasa.ng",
      //   password: "pelumia@123",
      // },
    ];

    // `track = false` means this seeder re-runs on every `seed:run`, so only
    // insert admins that aren't already there — otherwise the unique
    // constraint on `email` aborts the run.
    const existingAdmins = await admin.find({ select: ["email"] });
    const seededEmails = new Set(existingAdmins.map(({ email }) => email));
    const newAdmins = admins.filter(({ email }) => !seededEmails.has(email));

    if (newAdmins.length > 0) {
      await admin.save(
        admin.create(
          newAdmins.map((details) => ({
            ...details,
            password: hashResourceSync(details.password),
          })),
        ),
      );
    }
    console.log(
      `[seed] admins — ${newAdmins.length} created, ${admins.length - newAdmins.length} already present`,
    );

    // Exchange rates are owned by an admin; use the first one on record so the
    // FK holds whether or not this run is the one that created them.
    const [firstAdmin] = await admin.find({ order: { id: "ASC" }, take: 1 });
    if (!firstAdmin) return;

    const rate = dataSource.getRepository(ExchangeRate);

    const rates = [
      { rate: 1400, currency: CurrencyCoin.btc },
      { rate: 1400, currency: CurrencyCoin.bnb },
      { rate: 1420, currency: CurrencyCoin.ada },
      { rate: 1470, currency: CurrencyCoin.doge },
      { rate: 1410, currency: CurrencyCoin.eth },
      { rate: 1410, currency: CurrencyCoin.sol },
      { rate: 1440, currency: CurrencyCoin.usdc },
      { rate: 1450, currency: CurrencyCoin.usdt },
      { rate: 1430, currency: CurrencyCoin.xrp },
      { rate: 1430, currency: CurrencyCoin.pol },
    ];

    const existingRates = await rate.find();
    const seededRates = new Set(existingRates.map(({ currency }) => currency));

    const newRates = rates.filter(({ currency }) => !seededRates.has(currency));

    if (newRates.length > 0) {
      await rate.save(
        rate.create(
          newRates.map((details) => ({
            ...details,
            admin_id: firstAdmin.id,
            status: ExchangeRateStatus.active,
          })),
        ),
      );
    }
    console.log(
      `[seed] exchange rates — ${newRates.length} created, ${rates.length - newRates.length} already present`,
    );
  }
}
