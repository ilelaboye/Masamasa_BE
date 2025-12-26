// src/wallet/sol-hd-wallet.ts

import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction
} from "@solana/spl-token";
import axios from "axios";
import base58 from "bs58";
import { PublicService } from "../global/public/public.service";

const SOL_DERIVATION_PATH_PREFIX = "m/44'/501'"; // Solana BIP44 path

export class SolHDWallet {
  private seed: Buffer;

  constructor(private mnemonic: string, private readonly publicService: PublicService) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
  }

  getMasterKeypair(): Keypair {
    return this.deriveKeypair(0, 0, 0);
  }

  deriveKeypair(index: number, account = 0, change = 0): Keypair {
    const path = `${SOL_DERIVATION_PATH_PREFIX}/${account}'/${change}'/${index}'`;
    const derived = derivePath(path, this.seed.toString("hex"));
    return Keypair.fromSeed(derived.key);
  }

  getAddressFromKeypair(kp: Keypair): string {
    return kp.publicKey.toBase58();
  }

  /**
   * Sweep SOL from child wallet → master wallet
   * FIXED: auto-compute fee so simulation no longer fails
   */
  async sweepSOL(
    child: { privateKey: string; address: string },
    masterAddress: string,
    connection: Connection,
    index: number = 0
  ) {
    // Derive child keypair (your own function)
    const childKeypair = this.deriveKeypair(index);

    // 1. Check balance
    const balance = await connection.getBalance(childKeypair.publicKey);
    if (balance === 0) return false;

    // 2. Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Build a temporary transaction to calculate fee
    const tempTx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: childKeypair.publicKey
    }).add(
      SystemProgram.transfer({
        fromPubkey: childKeypair.publicKey,
        toPubkey: new PublicKey(masterAddress),
        lamports: balance // temp — will adjust after fee calc
      })
    );

    // 3. Calculate transaction fee
    const feeInfo = await connection.getFeeForMessage(tempTx.compileMessage());
    const requiredFee = feeInfo.value;

    if (requiredFee === null) {
      console.log("❌ Unable to fetch fee from RPC");
      return false;
    }

    // Calculate transferable amount
    const transferable = balance - requiredFee;

    if (transferable <= 0) {
      console.log(`Child wallet cannot afford tx fee. Balance: ${balance}, Fee: ${requiredFee}`);
      return false;
    }

    // Rebuild the final transaction
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: childKeypair.publicKey
    }).add(
      SystemProgram.transfer({
        fromPubkey: childKeypair.publicKey,
        toPubkey: new PublicKey(masterAddress),
        lamports: transferable
      })
    );

    // 4. Sign & send
    tx.sign(childKeypair);
    const raw = tx.serialize();

    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false
    });

    // 5. Confirm TX
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight
      },
      "confirmed"
    );

    console.log(
      `✅ Swept ${(transferable / 1e9).toFixed(8)} SOL → master wallet. Tx: ${signature}`
    );

    // Optional webhook
    if (transferable > 5_000_000) {
      await this._transactionWebhook({
        network: "SOLANA",
        address: childKeypair.publicKey.toBase58(),
        token_symbol: "SOL",
        amount: transferable / 1e9
      });
    }

    return true;
  }

  /**
   * Sweep SPL tokens (USDT, USDC, etc.)
   */
  async sweepSPLToken(
    child: { privateKey: any; address: string, store: any },
    masterAddress: string,
    tokenAddress: string,
    connection: Connection,
    index: number = 0,
    symbol: string = "USDT",
    masterKeypairKey: Keypair
  ) {
    try {
      // 1️⃣ Construct child keypair from provided privateKey
      const childKey = this.deriveKeypair(index);

      let childKeypair;
      childKeypair = Keypair.fromSecretKey(child.privateKey);

      const childPubkey = childKeypair.publicKey;

      console.log("start")
      // 2️⃣ Get token info
      const tokenMint = new PublicKey(tokenAddress);
      const childTokenAccount = await getAssociatedTokenAddress(tokenMint, childPubkey);
      const masterPubkey = new PublicKey(masterAddress);
      const masterTokenAccount = await getAssociatedTokenAddress(tokenMint, masterPubkey);

      const tokenInfo = await connection.getTokenAccountBalance(childTokenAccount).catch(() => null);
      if (!tokenInfo || tokenInfo.value.amount === "0") {
        console.log(`No ${symbol} to sweep.`);
        return false;
      }

      const tokenAmount = parseInt(tokenInfo.value.amount); // in raw token units
      const tokenDecimals = tokenInfo.value.decimals;

      // 3️⃣ Ensure child has enough SOL for fees
      let balance = await connection.getBalance(childPubkey);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const tempTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: childPubkey
      }).add(
        createTransferInstruction(childTokenAccount, masterTokenAccount, childPubkey, tokenAmount)
      );

      const feeInfo = await connection.getFeeForMessage(tempTx.compileMessage());
      const requiredFee = feeInfo.value ?? 5000;

      if (balance < requiredFee) {
        const missingAmount = requiredFee - balance;

        console.log(`Child missing ${missingAmount} lamports. Funding from master...`);

        const masterKeypair = masterKeypairKey;
        const masterPubkey = masterKeypair.publicKey;

        const { blockhash: bhMaster, lastValidBlockHeight: lvbhMaster } =
          await connection.getLatestBlockhash();

        const fundTx = new Transaction({
          recentBlockhash: bhMaster,
          feePayer: masterPubkey
        }).add(
          SystemProgram.transfer({
            fromPubkey: masterPubkey,
            toPubkey: childPubkey,
            lamports: missingAmount
          })
        );

        fundTx.sign(masterKeypair);

        const fundSig = await connection.sendRawTransaction(fundTx.serialize(), { skipPreflight: false });
        await connection.confirmTransaction({ signature: fundSig, blockhash: bhMaster, lastValidBlockHeight: lvbhMaster });

        console.log(`Child funded → Tx: ${fundSig}`);
        balance = await connection.getBalance(childPubkey);
      }

      // 4️⃣ Build final sweep transaction
      const { blockhash: bhSweep, lastValidBlockHeight: lvbhSweep } = await connection.getLatestBlockhash();

      const sweepTx = new Transaction({
        recentBlockhash: bhSweep,
        feePayer: childPubkey
      }).add(
        createTransferInstruction(childTokenAccount, masterTokenAccount, childPubkey, tokenAmount)
      );

      sweepTx.sign(childKeypair);

      const sig = await connection.sendRawTransaction(sweepTx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash: bhSweep, lastValidBlockHeight: lvbhSweep });

      console.log(`✅ Swept ${symbol}: ${tokenAmount / 10 ** tokenDecimals} → master. Tx: ${sig}`);

      const balance2 = tokenAmount / 10 ** tokenDecimals
      // Optional webhook
      if (balance2 > 0.0001) {
        await this._transactionWebhook({
          network: "SOLANA",
          address: childPubkey.toBase58(),
          token_symbol: symbol,
          amount: tokenAmount / 10 ** tokenDecimals
        });
      }
      return true;
    } catch (err) {
      console.log("❌ SPL Sweep failed:", err);
      return false;
    }
  }

  async getSolBalance(connection: Connection, address: string) {
    const pubkey = new PublicKey(address);
    const balanceLamports = await connection.getBalance(pubkey);
    const balanceSOL = balanceLamports / 1e9; // convert lamports to SOL
    return balanceSOL;
  }

  async getSPLTokenBalance(
    connection: Connection,
    walletAddress: string,
    tokenMintAddress: string
  ) {
    const owner = new PublicKey(walletAddress);
    const tokenMint = new PublicKey(tokenMintAddress);

    const tokenAccount = await getAssociatedTokenAddress(tokenMint, owner);

    try {
      const balanceInfo = await connection.getTokenAccountBalance(tokenAccount);
      const balance = Number(balanceInfo.value.amount) / Math.pow(10, balanceInfo.value.decimals);
      return balance;
    } catch (err) {
      return 0; // no token account or zero balance
    }
  }
  /**
   * Webhook
   */
  async withdrawSOL(
    toAddress: string,
    amountSOL: number,
    connection: Connection
  ): Promise<string> {
    const masterKp = this.getMasterKeypair();
    const destPubkey = new PublicKey(toAddress);
    const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: masterKp.publicKey,
        toPubkey: destPubkey,
        lamports: amountLamports,
      })
    );

    const signature = await connection.sendTransaction(transaction, [masterKp]);
    await connection.confirmTransaction(signature);
    return signature;
  }

  async withdrawSPLToken(
    toAddress: string,
    amount: number,
    tokenMintAddress: string,
    connection: Connection
  ): Promise<string> {
    const masterKp = this.getMasterKeypair();
    const destPubkey = new PublicKey(toAddress);
    const mintPubkey = new PublicKey(tokenMintAddress);

    const fromAta = await getAssociatedTokenAddress(mintPubkey, masterKp.publicKey);
    const toAta = await getAssociatedTokenAddress(mintPubkey, destPubkey);

    // Note: We assume the destination ATA is already created for simplicity in withdrawal
    // In a production environment, you might need to check and create it if missing.
    const amountTokens = Math.floor(amount * 1_000_000); // Assuming 6 decimals like USDC/USDT

    const transaction = new Transaction().add(
      createTransferInstruction(
        fromAta,
        toAta,
        masterKp.publicKey,
        amountTokens
      )
    );

    const signature = await connection.sendTransaction(transaction, [masterKp]);
    await connection.confirmTransaction(signature);
    return signature;
  }

  private async _transactionWebhook(transaction: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
  }) {
    try {
      return await this.publicService.transactionWebhook({
        ...transaction,
        amount: Number(transaction.amount)
      });
    } catch (error: any) {
      console.error("Transaction webhook failed:", error.message);
      throw new Error("Transaction webhook failed");
    }
  }
}
