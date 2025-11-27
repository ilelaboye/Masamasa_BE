import { appConfig } from "@/config";
import * as bip39 from "bip39";
import { hdkey } from "ethereumjs-wallet";
const TronWeb = require("tronweb");

export class TronHDWallet {
  private masterSeed: Buffer;
  private tronWeb: any;

  constructor(mnemonic: string, fullNode = "https://api.trongrid.io") {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
    this.masterSeed = bip39.mnemonicToSeedSync(mnemonic);

    // Proper TronWeb instance
    this.tronWeb = new TronWeb({
      fullHost: fullNode,
      headers: { "TRON-PRO-API-KEY": appConfig.TRX_API_KEY || "" },
      privateKey: "", // optional
    });
  }

  deriveChild(index: number) {
    // HD derivation for TRON: m/44'/195'/0'/0/index
    const hdWallet = hdkey.fromMasterSeed(this.masterSeed);
    const childWallet = hdWallet.derivePath(`m/44'/195'/0'/0/${index}`);
    const privateKeyBuffer = childWallet.getWallet().getPrivateKey();

    // Convert to hex string (TronWeb needs hex format)
    const privateKeyHex = privateKeyBuffer.toString("hex");

    // Generate TRON address
    const address = this.tronWeb.address.fromPrivateKey(privateKeyHex);

    return { privateKey: privateKeyHex, address };
  }

  getMasterWallet() {
    return this.deriveChild(0);
  }

  getChildAddress(index: number) {
    return this.deriveChild(index).address;
  }

  getChildPrivateKey(index: number) {
    return this.deriveChild(index).privateKey;
  }

   // <-- Add this helper for accessing the TronWeb instance
  getTronWebInstance() {
    return this.tronWeb;
  }
}
