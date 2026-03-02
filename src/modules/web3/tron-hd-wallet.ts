import { appConfig } from "@/config";
import axios from "axios";
import * as bip39 from "bip39";
import { hdkey } from "ethereumjs-wallet";
import { PublicService } from "../global/public/public.service";
const TronWeb = require("tronweb");

const TRON_TIMEOUT_MS = 10_000; // 10 seconds

/** Wraps any promise with a hard timeout to avoid ETIMEDOUT hanging the server */
function withTimeout<T>(promise: Promise<T>, ms = TRON_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tron call timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export class TronHDWallet {
  private masterSeed: Buffer;
  private tronWeb: any;
  private readonly publicService: PublicService;

  constructor(
    mnemonic: string,
    fullNode = "https://api.trongrid.io",
    publicService: PublicService,
  ) {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
    this.masterSeed = bip39.mnemonicToSeedSync(mnemonic);

    // Proper TronWeb instance
    this.tronWeb = new TronWeb({
      fullHost: fullNode,
      headers: { "TRON-PRO-API-KEY": appConfig.TRX_API_KEY || "" },
      privateKey: "", // optional
    });
    this.publicService = publicService;
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
    symbol: string = "TRX",
  ) {
    const tronWeb = new TronWeb({
      fullHost: tronRpc,
      privateKey: child.privateKey,
    });

    const address = child.address;

    // 1. Get TRX balance
    const balance = await withTimeout(tronWeb.trx.getBalance(address)) as any;
    if (balance <= 0) return null;

    // TRON transfer fee is always ~15 TRX bandwidth/energy if not frozen
    const FEE = 1_500; // 1.5 TRX in SUN

    if (balance <= FEE + 1) {
      console.log("Insufficient balance to cover TRON network fee");
      return null;
    }

    const sendAmount = balance - FEE;

    // 2. Send TRX sweep
    const tx = await withTimeout(
      tronWeb.transactionBuilder.sendTrx(masterAddressBase58, sendAmount, address),
    ) as any;

    const signedTx = await withTimeout(tronWeb.trx.sign(tx, child.privateKey)) as any;
    const receipt = await withTimeout(tronWeb.trx.sendRawTransaction(signedTx)) as any;

    console.log("TRX Sweep Tx:", receipt);

    // 3. webhook
    await this._transactionWebhook({
      address,
      network: "TRON",
      token_symbol: symbol,
      amount: sendAmount / 1e6,
      hash: receipt.txid,
      fee: (FEE / 1e6).toFixed(6),
    });

    return true;
  }

  async sweepTRC20(
    child: { privateKey: string; address: string },
    master: { privateKey: string; address: string },
    tronRpc: string,
    tokenAddress: string,
    symbol: string = "USDT",
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

    console.log(
      `${symbol} balance of child wallet ${childAddress}: ${tokenBalance}`,
    );

    if (tokenBalance === 0) return null;
    // 4. Check TRX balance to pay fees
    const trxBalance = await withTimeout(tronWebChild.trx.getBalance(childAddress)) as any;

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
        hash: tx,
        fee: (FEE_ESTIMATE / 1_000_000).toFixed(6),
      });
    }

    return true;
  }

  async withdrawTRX(toAddress: string, amountTRX: number): Promise<string> {
    const master = this.getMasterWallet();
    const amountSun = Math.floor(amountTRX * 1_000_000);

    const transaction = await withTimeout(
      this.tronWeb.transactionBuilder.sendTrx(toAddress, amountSun, master.address),
    ) as any;

    const signedTx = await withTimeout(
      this.tronWeb.trx.sign(transaction, master.privateKey),
    ) as any;
    const receipt = await withTimeout(this.tronWeb.trx.sendRawTransaction(signedTx)) as any;

    if (!receipt.result) {
      throw new Error(`TRX withdrawal failed: ${JSON.stringify(receipt)}`);
    }

    return receipt.txid;
  }

  async withdrawTRC20(
    toAddress: string,
    amount: number,
    tokenAddress: string,
  ): Promise<string> {
    const master = this.getMasterWallet();
    const contract = await this.tronWeb.contract().at(tokenAddress);

    // Most TRC20 tokens have 6 decimals (e.g. USDT)
    const amountTokens = Math.floor(amount * 1_000_000);

    const tx = await contract.transfer(toAddress, amountTokens).send({
      privateKey: master.privateKey,
    });

    return tx;
  }

  async getChildTRC20History(
    childIndex: number,
    tokenAddress: string,
    limit: number = 3,
  ): Promise<any[]> {
    const childAddress = this.getChildAddress(childIndex);

    const url = `https://api.trongrid.io/v1/accounts/${childAddress}/transactions/trc20?limit=${limit}&contract_address=${tokenAddress}`;

    try {
      const { data } = await axios.get(url, {
        headers: { "TRON-PRO-API-KEY": appConfig.TRX_API_KEY },
        timeout: TRON_TIMEOUT_MS,
      });

      if (!data || !data.data) return [];

      // Normalize history entries
      const history = data.data.map((tx: any) => ({
        txID: tx.transaction_id,
        type: tx.from === childAddress ? "OUT" : "IN",
        from: tx.from,
        to: tx.to,
        amount: Number(tx.value) / 1e6, // typical 6 decimals
        tokenAddress: tx.token_info.address,
        symbol: tx.token_info.symbol,
        decimals: tx.token_info.decimals,
        network: "TRON",
        status: "success",
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

  async getChildTRXHistory(
    childIndex: number,
    limit: number = 3,
  ): Promise<any[]> {
    const childAddress = this.getChildAddress(childIndex);
    const url = `https://api.trongrid.io/v1/accounts/${childAddress}/transactions?limit=${limit}`;

    try {
      const { data } = await axios.get(url, {
        headers: { "TRON-PRO-API-KEY": appConfig.TRX_API_KEY },
        timeout: TRON_TIMEOUT_MS,
      });

      if (!data || !data.data) return [];

      const history = data.data
        .filter(
          (tx: any) => tx.raw_data.contract[0].type === "TransferContract",
        )
        .map((tx: any) => {
          const contract = tx.raw_data.contract[0].value;
          const from = this.tronWeb.address.fromHex(contract.owner_address);
          const to = this.tronWeb.address.fromHex(contract.to_address);

          return {
            txID: tx.txID,
            type: from === childAddress ? "OUT" : "IN",
            from,
            to,
            amount: contract.amount / 1e6,
            token_symbol: "TRX",
            network: "TRON",
            status: "success",
            timestamp: tx.raw_data.timestamp,
            date: new Date(tx.raw_data.timestamp),
          };
        });

      return history.filter((a: any) => a.type === "IN");
    } catch (err: any) {
      console.error("Failed to fetch TRX history:", err.message);
      return [];
    }
  }

  private async _transactionWebhook(transactionWebhook: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
    hash?: string;
    fee?: any;
  }) {
    try {
      return await this.publicService.transactionWebhook({
        ...transactionWebhook,
        amount: Number(transactionWebhook.amount),
      });
    } catch (error: any) {
      console.error("Failed to call transaction webhook:", error.message);
      throw new Error("Transaction webhook failed");
    }
  }
}
