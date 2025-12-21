import { appConfig } from "@/config";
import axios from "axios";
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


  async sweepTRON(
    child: { privateKey: string; address: string },
    masterAddressBase58: string,
    tronRpc: string,
    symbol: string = "TRX"
  ) {
    const tronWeb = new TronWeb({
      fullHost: tronRpc,
      privateKey: child.privateKey,
    });

    const address = child.address;

    // 1. Get TRX balance
    const balance = await tronWeb.trx.getBalance(address);
    if (balance <= 0) return null;

    // TRON transfer fee is always ~15 TRX bandwidth/energy if not frozen
    const FEE = 1_500; // 1.5 TRX in SUN

    if (balance <= (FEE + 1)) {
      console.log("Insufficient balance to cover TRON network fee");
      return null;
    }

    const sendAmount = balance - FEE;

    // 2. Send TRX sweep
    const tx = await tronWeb.transactionBuilder.sendTrx(
      masterAddressBase58,
      sendAmount,
      address
    );

    const signedTx = await tronWeb.trx.sign(tx, child.privateKey);
    const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

    console.log("TRX Sweep Tx:", receipt);

    // 3. webhook
    await this._transactionWebhook({
      address,
      network: "TRON",
      token_symbol: symbol,
      amount: sendAmount / 1e6
    });

    return true;
  }

  async sweepTRC20(
    child: { privateKey: string; address: string },
    master: { privateKey: string; address: string },
    tronRpc: string,
    tokenAddress: string,
    symbol: string = "USDT"
  ) {
    // 1. Initialize TronWeb for child wallet
    const tronWebChild = new TronWeb({
      fullHost: tronRpc,
      privateKey: child.privateKey,
      timeout: 20000, // 20s timeout
    });

    const childAddress = child.address;

    // 2. Get TRC20 token contract
    let tokenContract;
    try {
      tokenContract = await tronWebChild.contract().at(tokenAddress);
    } catch (err) {
      console.error("Failed to get TRC20 contract:", err);
      throw new Error("TRC20 contract lookup failed");
    }

    // 3. Get token balance
    let balanceRaw: string;
    try {
      balanceRaw = await tokenContract.balanceOf(childAddress).call();
    } catch (err) {
      console.error("Failed to read token balance:", err);
      throw new Error("Failed to fetch TRC20 balance");
    }

    const tokenBalance = Number(balanceRaw);



    console.log(`${symbol} balance of child wallet ${childAddress}: ${tokenBalance}`);

    if (tokenBalance === 0) return null;
    // 4. Check TRX balance to pay fees
    const trxBalance = await tronWebChild.trx.getBalance(childAddress);

    // Estimate needed fee for TRC20 transfer
    const FEE_ESTIMATE = 30 * 1_000_000; // 30 TRX in SUN as buffer

    // 5. Transfer TRC20 tokens to master wallet
    let tx;
    try {
      tx = await tokenContract.transfer(master.address, tokenBalance).send();
    } catch (err) {
      console.error("TRC20 transfer failed:", err);
      throw new Error("TRC20 sweep transaction failed");
    }

    console.log(`${symbol} sweep successful. TxID: ${tx}`);

    // 6. Optional webhook notification
    if (typeof this._transactionWebhook === "function") {
      await this._transactionWebhook({
        address: childAddress,
        network: "TRON",
        token_symbol: symbol,
        amount: tokenBalance / 1_000_000, // convert SUN to token units if 6 decimals
      });
    }

    return true;
  }

  async getChildTRC20History(
    childIndex: number,
    tokenAddress: string,
    limit: number = 3
  ): Promise<any[]> {
    const childAddress = this.getChildAddress(childIndex);
    console.log(childAddress);

    const url = `https://api.trongrid.io/v1/accounts/${childAddress}/transactions/trc20?limit=${limit}&contract_address=${tokenAddress}`;

    try {
      const { data } = await axios.get(url, {
        headers: { "TRON-PRO-API-KEY": appConfig.TRX_API_KEY },
      });

      if (!data || !data.data) return [];

      // Normalize history entries
      const history = data.data.map((tx: any) => (
        {
          txID: tx.transaction_id,
          type: tx.from === childAddress ? "OUT" : "IN",
          from: tx.from,
          to: tx.to,
          amount: Number(tx.value) / 1e6, // typical 6 decimals
          tokenAddress: tx.token_info.address,
          symbol: tx.token_info.symbol,
          decimals: tx.token_info.decimals,
          timestamp: tx.block_timestamp,
          date: new Date(tx.block_timestamp),
        }));

      const filterData = history.filter((a: any) => a.type === "IN");

      return filterData;
    } catch (err: any) {
      console.error("Failed to fetch TRC20 history:", err.message);
      return [];
    }
  }


  private async _transactionWebhook(transactionWebhook: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
  }) {
    try {
      const response = await axios.post(
        "https://api-masamasa.usemorney.com/webhook/transaction", // replace with your actual URL
        transactionWebhook
      );
      return response.data;
    } catch (error: any) {
      console.error("Failed to call transaction webhook:", error.message);
      throw new Error("Transaction webhook failed");
    }
  }
}
