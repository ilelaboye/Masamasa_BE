import { appConfig } from "@/config";
import * as bcrypt from "bcrypt";

const saltOrRounds = Number(appConfig.BCRYPT_SALT);

export const hashResource = async (password: string) =>
  await bcrypt.hash(password, saltOrRounds);

export const hashResourceSync = (password: string) =>
  bcrypt.hashSync(password, saltOrRounds);

export const verifyHash = async (password?: string, hashedResource?: string) =>
  password && hashedResource
    ? await bcrypt.compare(password, hashedResource)
    : false;
