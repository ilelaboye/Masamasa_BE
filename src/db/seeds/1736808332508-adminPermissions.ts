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
        first_name: "Lekan",
        last_name: "Ilelaboye",
        email: "ilelaboyealekan@gmail.com",
        password: hashResourceSync("Password@123"),
      },
    ]);
    await admin.save(newAdmin);
  }
}
