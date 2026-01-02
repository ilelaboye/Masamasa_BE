import { appConfig } from "@/config";
import * as crypto from "node:crypto";

export class Crypto {
  private static algorithm: crypto.CipherGCMTypes = "aes-256-gcm";
  private static iterations = 246;
  private static keylen = 32;
  private static digest = "sha512";
  private static secret =
    appConfig.COOKIE_SECRET ?? "secret_quid111wave3a5338e173";

  public static encrypt(data: string, secretKey?: string): string {
    secretKey = secretKey || Crypto.secret;
    const inputEncoding = "utf8";
    const outputEncoding = "base64";
    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(64);
    const key = crypto.pbkdf2Sync(
      secretKey,
      salt,
      Crypto.iterations,
      Crypto.keylen,
      Crypto.digest,
    );
    const cipher = crypto.createCipheriv(Crypto.algorithm, key, iv);
    const enc1 = cipher.update(data, inputEncoding);
    const enc2 = cipher.final();
    const tag = cipher.getAuthTag();
    const encryptedData = Buffer.concat([iv, salt, tag, enc1, enc2]).toString(
      outputEncoding,
    );
    return encryptedData;
  }

  public static decrypt(encryptedData: string, secretKey?: string): string {
    secretKey = secretKey || Crypto.secret;
    const inputEncoding = "base64";
    const outputEncoding = "utf8";
    const bufferData = Buffer.from(encryptedData, inputEncoding);
    const iv = bufferData.subarray(0, 12);
    const salt = bufferData.subarray(12, 76);
    const tag = bufferData.subarray(76, 92);
    const text = bufferData.subarray(92);
    const key = crypto.pbkdf2Sync(
      secretKey,
      salt,
      Crypto.iterations,
      Crypto.keylen,
      Crypto.digest,
    );
    const decipher = crypto.createDecipheriv(Crypto.algorithm, key, iv);
    decipher.setAuthTag(tag);
    let str = decipher.update(text, undefined, outputEncoding);
    str += decipher.final(outputEncoding);
    return str;
  }
}
