import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import axios from "axios";

export async function sweepSPLToken(
  childSecretKey: Uint8Array, // 64-byte secret key of child
  masterKeypair: Keypair, // master with secret key
  tokenMintAddress: string,
  connection: Connection,
  symbol: string = "USDT",
): Promise<boolean> {
  const childKeypair = Keypair.fromSecretKey(childSecretKey);
  const childPubkey = childKeypair.publicKey;
  const masterPubkey = masterKeypair.publicKey;
  const mint = new PublicKey(tokenMintAddress);

  try {
    console.log(
      `\nSweeping ${symbol} → ${childPubkey.toBase58()} → ${masterPubkey.toBase58()}`,
    );

    const childATA = await getAssociatedTokenAddress(mint, childPubkey);
    const masterATA = await getAssociatedTokenAddress(mint, masterPubkey);

    // Check balance
    let childAcc;
    try {
      childAcc = await getAccount(connection, childATA);
    } catch {
      console.log(`No ${symbol} account on child`);
      return false;
    }

    const amount = childAcc.amount;
    const decimals = Number(childAcc.mintDecimals ?? 6);
    const uiAmount = Number(amount) / 10 ** decimals;

    if (uiAmount === 0) return false;
    if (uiAmount < 0.001) return false;
    console.log(`Found ${uiAmount} ${symbol}`);

    // Build instructions array
    const instructions: any[] = []; // ← "any[]" is the trick that kills the TS error in v2

    // Create master ATA if needed
    if (!(await connection.getAccountInfo(masterATA))) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          childPubkey, // payer = child
          masterATA,
          masterPubkey,
          mint,
        ),
      );
    }

    // Transfer (USDT transfer-fee safe)
    const sendAmount =
      symbol === "USDT" && decimals === 6 ? amount - 1n : amount;

    instructions.push(
      createTransferCheckedInstruction(
        childATA,
        mint,
        masterATA,
        childPubkey,
        sendAmount,
        decimals,
      ),
    );

    // Auto-fund child with SOL if needed
    const { blockhash } = await connection.getLatestBlockhash();
    const testMsg = new TransactionMessage({
      payerKey: childPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const fee = (await connection.getFeeForMessage(testMsg)).value ?? 10_000;
    const childSol = await connection.getBalance(childPubkey);

    if (childSol < fee + 5_000_000) {
      // ~0.005 SOL buffer
      console.log("Funding child with SOL from master...");
      const fundIx = SystemProgram.transfer({
        fromPubkey: masterPubkey,
        toPubkey: childPubkey,
        lamports: 1000_000n, // 0.02 SOL
      });

      const fundMsg = new TransactionMessage({
        payerKey: masterPubkey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [fundIx],
      }).compileToV0Message();

      const fundTx = new VersionedTransaction(fundMsg);
      fundTx.sign([masterKeypair]);
      const sig = await connection.sendTransaction(fundTx, { maxRetries: 2 });
      await connection.confirmTransaction(sig);
      console.log(`Funded → https://solscan.io/tx/${sig}`);
    }

    // Final sweep
    const finalMsg = new TransactionMessage({
      payerKey: childPubkey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions,
    }).compileToV0Message();

    const sweepTx = new VersionedTransaction(finalMsg);
    sweepTx.sign([childKeypair]);

    const signature = await connection.sendTransaction(sweepTx, {
      maxRetries: 3,
    });
    await connection.confirmTransaction(signature, "confirmed");

    console.log(`SUCCESS! ${uiAmount} ${symbol} swept`);
    console.log(`https://solscan.io/tx/${signature}\n`);

    if (uiAmount > 0.01) {
      await _transactionWebhook({
        network: "SOLANA",
        address: childPubkey.toBase58(),
        token_symbol: symbol,
        amount: uiAmount,
      });
    }

    return true;
  } catch (err: any) {
    console.error(`Failed: ${err.message || err}`);
    return false;
  }
}

async function _transactionWebhook(transaction: {
  network: string;
  address: string;
  amount: number | string;
  token_symbol: string;
}) {
  try {
    const response = await axios.post(
      "https://api-masamasa.usemorney.com/webhook/transaction",
      transaction,
    );
    return response.data;
  } catch (error: any) {
    console.error("Transaction webhook failed:", error.message);
    throw new Error("Transaction webhook failed");
  }
}
