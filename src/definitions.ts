import type { Request } from "express";
import { User } from "./modules/users/entities/user.entity";
import { Administrator } from "./modules/administrator/entities/administrator.entity";

export type UserRequest = Request & { user: User };

export type AdminRequest = Request & { admin: Administrator };

export type CloudinaryUpload = {
  asset_id: string;
  public_id: string;
  version: number;
  version_id: string;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  type: string;
  etag: string;
  placeholder: boolean;
  url: string;
  secure_url: string;
  folder: string;
  original_filename: string;
  name?: string;
};

export enum SystemPreferenceFetcher {
  user = "user",
  company = "company",
}

export type iCookieData = {
  token: string;
  user: User;
};

export type iAdminCookieData = {
  token: string;
  admin: Administrator;
};

export type CurrencyType = {
  symbol?: string;
  name: string;
  symbol_native: string;
  decimal_digits: number;
  rounding: number;
  code?: string;
  name_plural: string;
};

export enum PermissionValueType {
  IS_ADMIN = "IS_ADMIN",
  CAN_CREATE_ITEMS = "CAN_CREATE_ITEMS",
  CAN_CREATE_WAREHOUSE = "CAN_CREATE_WAREHOUSE",
  CAN_CREATE_SITE = "CAN_CREATE_SITE",
  CAN_CREATE_HOUSING = "CAN_CREATE_HOUSING",
  CAN_CREATE_REGION = "CAN_CREATE_REGION",
  CAN_CREATE_ISSUANCE = "CAN_CREATE_ISSUANCE",
  CAN_RECEIVE_ISSUANCE = "CAN_RECEIVE_ISSUANCE",
}

export enum SystemCache {
  "SYSTEM_STAFF_PREFERENCES" = "SYSTEM_USER_PREFERENCES",
  "SYSTEM_COMPANY_PREFERENCES" = "SYSTEM_COMPANY_PREFERENCES",
  "STAFF_PREFERENCES" = "STAFF_PREFERENCES",
  "COMPANY_PREFERENCES" = "COMPANY_PREFERENCES",
  "STAFF_PERMISSIONS" = "STAFF_PERMISSIONS",
  "DEFAULT_STAFF_PREFERENCES" = "DEFAULT_STAFF_PREFERENCES",
  "DEFAULT_COMPANY_PREFERENCES" = "DEFAULT_COMPANY_PREFERENCES",
  "COMPANY_ROLES" = "COMPANY_ROLES",
  "STAFF_ROLES" = "STAFF_ROLES",
  "ADMIN_PERMISSIONS" = "ADMIN_PERMISSIONS",
}

export interface MailAttachment {
  ContentType: string | false;
  Filename: string;
  Base64Content: string;
}

export interface MailDataType {
  subject: string;
  attachments?: string[];
  html?: string;
  templateId?: number;
  variables?: object;
}

export interface MailerOptions {
  to: {
    name: string;
    email: string;
  };
  from?: {
    email: string;
    name: string;
  };
}
