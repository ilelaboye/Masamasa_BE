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
  templateId?: number | string;
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

export interface VTPassServiceListResponse {
  response_description: string;
  content: VTPassServiceResponse[];
}

export interface VTPassServiceResponse {
  identifier: string;
  serviceID: string;
  name: string;
  minimium_amount: string;
  maximum_amount: string;
  convinience_fee: string;
  product_type: string;
  image: string;
}

export interface VariationItem {
  variation_code: string;
  name: string;
  variation_amount: string;
  fixedPrice: string;
}
export interface VTPassResponse {
  code: string;
  content: {
    error?: string;
    transactions: {
      status: string;
      product_name: string;
      unique_element: string;
      unit_price: string;
      quantity: number;
      service_verification: null;
      channel: string;
      commission: number;
      total_amount: number;
      discount: null;
      type: string;
      email: string;
      phone: string;
      name: null;
      convinience_fee: number;
      amount: string;
      platform: string;
      method: string;
      transactionId: string;
      commission_details: {
        amount: number;
        rate: string;
        rate_type: string;
        computation_type: string;
      };
    };
    ServiceName: string;
    serviceID: string;
    convinience_fee: string;
    variations: VariationItem[];

    // for cable verification
    Customer_Name: string;
    Status: string;
    Due_Date: string;
    Customer_Number: string;
    Customer_Type: string;
    commission_details: {
      amount: number | null;
      rate: string;
      rate_type: string;
      computation_type: string;
    };

    // for electricity verification
    Address: string;
    Meter_Number: string;
    Customer_Arrears: string;
    Minimum_Amount: string;
    Min_Purchase_Amount: string;
    Can_Vend: string;
    Business_Unit: string;
    Customer_Account_Type: string;
    Meter_Type: string;
    WrongBillersCode: boolean;
  };
  response_description: string;
  requestId: string;
  amount: number;
  transaction_date: string;
  purchased_code: string;

  customerName?: string;
  customerAddress?: string;
  meterNumber?: string;
  token?: string;
  tokenAmount?: number;
  exchangeReference?: string;
  resetToken?: string;
  configureToken?: string;
  units?: string;
  fixChargeAmount?: number;
  tariff?: string;
  taxAmount?: number;
  debtAmount?: number;
  kct1?: string;
  kct2?: string;
  penalty?: number;
  costOfUnit?: number;
  announcement?: string;
  meterCost?: number;
  currentCharge?: number;
  lossOfRevenue?: number;
  tariffBaseRate?: number;
  installationFee?: number;
  reconnectionFee?: number;
  meterServiceCharge?: number;
  administrativeCharge?: number;
}
