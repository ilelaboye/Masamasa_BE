// Side-effect import: pins Postgres `timestamp` reads and writes to UTC. Must
// come before the DataSource is constructed, since it configures the driver's
// global type parsers. See the file for the hour-off bug it fixes.
import "./pg-timezone";
import { DataSource, DataSourceOptions } from "typeorm";
import { dbConfig } from "./app";

export const dataSource = {
  type: "postgres",
  host: dbConfig.DB_HOST,
  port: parseInt(dbConfig.DB_PORT),
  username: dbConfig.DB_USERNAME,
  password: dbConfig.DB_PASSWORD,
  database: dbConfig.DB_NAME,
  synchronize: false,
  // NOTE: `timezone` is a MySQL driver option and is ignored by Postgres — it
  // never had any effect here. Timezone handling lives in ./pg-timezone.
  logging: false,
  entities: [__dirname + "/../modules/**/*.entity{.ts,.js}"],
  migrations: [__dirname + "/../db/migrations/*.{ts,js}"],
  seeds: [__dirname + "/../db/seeds/*.{ts,js}"],
  factories: [__dirname + "/../db/factories/*.{ts,js}"],
} as DataSourceOptions;

export default new DataSource(dataSource);
