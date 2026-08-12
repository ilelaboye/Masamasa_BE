import { appConfig } from "@/config";
import { Logger } from "@nestjs/common";

const Flutterwave = require("flutterwave-node-v3");

// Built at import time, this throws "Public Key required" when FLW_PUBLIC_KEY
// is unset — taking down every module that reaches this file through the
// core/utils barrel. Kept for reference; construction now happens on first use.
// const flw = new Flutterwave(appConfig.FLW_PUBLIC_KEY, appConfig.FLW_SECRET_KEY);

let client: any;

function flw() {
  if (!client) {
    client = new Flutterwave(
      appConfig.FLW_PUBLIC_KEY,
      appConfig.FLW_SECRET_KEY,
    );
  }
  return client;
}

export async function transferWithFlutterWave({
  amount,
  bankCode,
  accountNumber,
  ref,
  narration,
}) {
  try {
    Logger.log("START TRANSFER");
    const payload = {
      account_bank: bankCode, //This is the recipient bank code. Get list here :https://developer.flutterwave.com/v3.0/reference#get-all-banks
      account_number: accountNumber,
      amount: amount,
      narration: narration ?? "",
      currency: "NGN",
      reference: ref, //This is a merchant's unique reference for the transfer, it can be used to query for the status of the transfer
      callback_url:
        "https://api-masamasa.usemorney.com/webhook/flutterwave/transfer",
      debit_currency: "NGN",
    };

    const response = await flw().Transfer.initiate(payload);
    console.log("response", response);
    return {
      status: response.status == "error" ? false : true,
      message: response.message,
      data: response,
    };
  } catch (error) {
    console.log(error);
    return { status: false, data: error };
  }
}

export async function verifyTransfer({ id }) {
  try {
    const payload = {
      id: id,
    };

    const response = await flw().Transfer.get_a_transfer(payload);
    console.log("response", response);
    return {
      status: response.status == "error" ? false : true,
      message: response.message,
      data: response,
    };
  } catch (error) {
    console.log(error);
    return { status: false, data: error };
  }
}

export async function getBanks() {
  try {
    const payload = {
      country: "NG",
    };
    const response = await flw().Bank.country(payload);
    return response.data;
  } catch (error) {
    console.log(error);
    return { status: false, data: error };
  }
}
