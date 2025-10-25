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
  timezone: "UTC+1", //'+01:00'
  logging: false,
  entities: [__dirname + "/../modules/**/*.entity{.ts,.js}"],
  migrations: [__dirname + "/../db/migrations/*.{ts,js}"],
  seeds: [__dirname + "/../db/seeds/*.js"],
  factories: [__dirname + "/../db/factories/*.{ts,js}"],
} as DataSourceOptions;

export default new DataSource(dataSource);
