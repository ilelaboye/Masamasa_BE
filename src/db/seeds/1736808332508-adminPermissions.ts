import { hashResourceSync } from "@/core/utils";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import { DataSource } from "typeorm";
import { Seeder, SeederFactoryManager } from "typeorm-extension";

export class AdminPermissions1736808332508 implements Seeder {
  track = false;

  public async run(dataSource: DataSource): Promise<any> {
    const admin = dataSource.getRepository(Administrator);
    const newAdmin = admin.create([
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
  }
}
