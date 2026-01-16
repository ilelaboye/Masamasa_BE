import { appConfig } from "@/config";
import { generateAlphaNumericString } from "../helpers";
import crypto from "crypto";

export const generateVtpassRequestId = (user_id) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const masaId = `MASA${generateAlphaNumericString(10)}`; // Example of an alphanumeric string to concatenate

  return `${year}${month}${day}${hours}${minutes}${masaId}00${user_id}`;
};

export const verifyNombaWebhook = (payload, signatureValue, nombaTimeStamp) => {
  try {
    // const signatureValue = "Kt9095hQxfgmVbx6iz7G2tPhHdbdXgLlyY/mf35sptw=";
    // const nombaTimeStamp = "2025-09-29T10:51:44Z";
    const secret = appConfig.NOMBA_WEBHOOK_SECRET;
    console.log(`Using secret [${secret}]`);

    const mySig = generateSignature(payload, secret, nombaTimeStamp);

    console.log(`Generated signature [${mySig}]`);
    console.log(`Expected signature [${signatureValue}]`);

    if (signatureValue.toLowerCase() === mySig.toLowerCase()) {
      console.log(">>>>>>> Signatures match <<<<<<<<<<<");
    } else {
      console.log("<<<<<<<<< Signatures did not match >>>>>>>>>");
    }
  } catch (ex) {
    console.error("Error occurred while generating signature:", ex.message);
  }
};

export const generateSignature = (payload, secret, timeStamp) => {
  const requestPayload = payload;
  const data = requestPayload.data || {};
  const merchant = data.merchant || {};
  const transaction = data.transaction || {};

  const eventType = requestPayload.event_type || "";
  const requestId = requestPayload.requestId || "";
  const userId = merchant.userId || "";
  const walletId = merchant.walletId || "";
  const transactionId = transaction.transactionId || "";
  const transactionType = transaction.type || "";
  const transactionTime = transaction.time || "";
  let transactionResponseCode = transaction.responseCode || "";

  if (transactionResponseCode === "null") {
    transactionResponseCode = "";
  }

  const hashingPayload = `${eventType}:${requestId}:${userId}:${walletId}:${transactionId}:${transactionType}:${transactionTime}:${transactionResponseCode}:${timeStamp}`;

  console.log(`::: payload to hash --> [${hashingPayload}] :::`);

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(hashingPayload);
  const hash = hmac.digest("base64");

  return hash;
};

// Run
// hooksCron2();
