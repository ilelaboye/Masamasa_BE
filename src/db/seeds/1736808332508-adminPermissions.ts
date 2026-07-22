import { hashResourceSync } from "@/core/utils";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import {
  CurrencyCoin,
  ExchangeRate,
  ExchangeRateStatus,
} from "@/modules/exchange-rates/exchange-rates.entity";
import { stat } from "fs";
import { DataSource } from "typeorm";
import type { Seeder } from "typeorm-extension";

export class AdminPermissions1736808332508 implements Seeder {
  track = false;

  public async run(dataSource: DataSource): Promise<any> {
    const admin = dataSource.getRepository(Administrator);
    const newAdmin = admin.create([
      {
        first_name: "Lekan",
        last_name: "Ilelaboye",
        email: "ilelaboyealekan@gmail.com",
        password: hashResourceSync("Password@123"),
      },
      {
        first_name: "Loveth",
        last_name: "Adetunji",
        email: "loveth@masamasa.ng",
        password: hashResourceSync("lovetha@123"),
      },
      {
        first_name: "Seyi",
        last_name: "Olugbeko",
        email: "seyi@masamasa.ng",
        password: hashResourceSync("seyio@123"),
      },
      {
        first_name: "Pelumi",
        last_name: "Ayandoye",
        email: "pelumi@masamasa.ng",
        password: hashResourceSync("pelumia@123"),
      },
    ]);
    await admin.save(newAdmin);

    const rate = dataSource.getRepository(ExchangeRate);
    const newRate = rate.create([
      {
        admin_id: 1,
        rate: 1400,
        currency: CurrencyCoin.btc,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1400,
        currency: CurrencyCoin.bnb,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1420,
        currency: CurrencyCoin.ada,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1470,
        currency: CurrencyCoin.doge,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1410,
        currency: CurrencyCoin.eth,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1410,
        currency: CurrencyCoin.sol,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1440,
        currency: CurrencyCoin.usdc,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1450,
        currency: CurrencyCoin.usdt,
        status: ExchangeRateStatus.active,
      },
      {
        admin_id: 1,
        rate: 1430,
        currency: CurrencyCoin.xrp,
        status: ExchangeRateStatus.active,
      },
    ]);
    await rate.save(newRate);
  }
}
