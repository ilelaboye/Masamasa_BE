import { Client, Wallet, xrpToDrops, dropsToXrp } from "xrpl";
import { appConfig } from "@/config";
import { PublicService } from "../global/public/public.service";

export class XrpHDWallet {
    private client: Client;

    constructor(
        private mnemonic: string,
        private readonly publicService: PublicService,
    ) {
        this.client = new Client(appConfig.XRP_RPC_URL);
    }

    private async ensureConnected() {
        if (!this.client.isConnected()) {
            await this.client.connect();
        }
    }

    /**
     * Derive XRP wallet from mnemonic and index
     * XRP uses standard BIP44 path m/44'/144'/0'/0/index
     */
    async deriveWallet(index: number): Promise<Wallet> {
        return Wallet.fromMnemonic(this.mnemonic, {
            derivationPath: `m/44'/144'/0'/0/${index}`,
        });
    }

    async getMasterWallet(): Promise<Wallet> {
        return this.deriveWallet(0);
    }

    async getBalance(address: string): Promise<number> {
        await this.ensureConnected();
        try {
            const balance = await this.client.getXrpBalance(address);
            return Number(balance);
        } catch (error: any) {
            if (error.data?.error === "actNotFound") {
                return 0;
            }
            throw error;
        }
    }

    /**
     * Withdraw XRP from master wallet to destination
     */
    async withdrawXRP(toAddress: string, amount: number): Promise<string> {
        await this.ensureConnected();
        const masterWallet = await this.getMasterWallet();

        const prepared = await this.client.autofill({
            TransactionType: "Payment",
            Account: masterWallet.address,
            Amount: xrpToDrops(amount),
            Destination: toAddress,
        });

        const signed = masterWallet.sign(prepared);
        const result = await this.client.submitAndWait(signed.tx_blob);

        if (typeof result.result.meta !== 'string' && result.result.meta?.TransactionResult === "tesSUCCESS") {
            return signed.hash;
        } else {
            const message = typeof result.result.meta !== 'string' ? result.result.meta?.TransactionResult : result.result.meta;
            throw new Error(`XRP Transfer failed: ${message}`);
        }
    }

    /**
     * Sweep XRP from child wallet to master wallet
     */
    async sweepXRP(index: number, masterAddress: string): Promise<boolean> {
        await this.ensureConnected();
        const childWallet = await this.deriveWallet(index);
        const balance = await this.getBalance(childWallet.address);

        // XRP has a base reserve (usually 10 XRP). 
        // We can only sweep if balance is significantly above reserve.
        // However, some users might want to close the account to get back 8 XRP reserve.
        // For now, let's do a normal transfer of available balance minus fee.

        if (balance <= 10.001) { // 10 XRP reserve + small buffer
            console.log(`Insufficient XRP balance to sweep from ${childWallet.address}. Balance: ${balance}`);
            return false;
        }

        const amountToSweep = balance - 0.000012; // Subtract a standard fee (12 drops)
        // Actually, xrpl client autofill handles fees. But we need to know how much to send.
        // In XRP, if you send 'Amount', the fee is extra. 
        // To sweep everything, we might need AccountDelete (if reserve recovery is wanted) 
        // or just leave the reserve. Let's leave reserve for now as AccountDelete is complex.

        const transferable = balance - 10 - 0.00002; // Available minus reserve minus slightly higher fee

        if (transferable <= 0) return false;

        const prepared = await this.client.autofill({
            TransactionType: "Payment",
            Account: childWallet.address,
            Amount: xrpToDrops(transferable),
            Destination: masterAddress,
        });

        const signed = childWallet.sign(prepared);
        const result = await this.client.submitAndWait(signed.tx_blob);

        if (typeof result.result.meta !== 'string' && result.result.meta?.TransactionResult === "tesSUCCESS") {
            await this._transactionWebhook({
                network: "RIPPLE",
                address: childWallet.address,
                token_symbol: "XRP",
                amount: transferable,
            });
            return true;
        }

        return false;
    }

    async getChildTransactionHistory(index: number, limit: number = 3): Promise<any[]> {
        await this.ensureConnected();
        const wallet = await this.deriveWallet(index);

        try {
            const response = await this.client.request({
                command: "account_tx",
                account: wallet.address,
                limit: 20, // Fetch more to filter for deposits
            });

            const transactions = response.result.transactions;
            const results: any[] = [];

            for (const txObj of transactions) {
                if (results.length >= limit) break;

                const tx: any = txObj.tx;
                const meta: any = txObj.meta;

                // Skip if not a successful Payment
                if (tx.TransactionType !== "Payment" || meta.TransactionResult !== "tesSUCCESS") continue;

                // Skip if not a deposit (Destination must be our wallet)
                if (tx.Destination !== wallet.address) continue;

                // Extract amount (XRP is string in drops, or object for tokens)
                let amount = 0;
                if (typeof tx.Amount === "string") {
                    amount = Number(dropsToXrp(tx.Amount));
                } else {
                    // This is a token (IOU) payment, we only care about native XRP for now
                    continue;
                }

                results.push({
                    txID: tx.hash,
                    type: "IN",
                    amount: amount,
                    token_symbol: "XRP",
                    network: "RIPPLE",
                    status: "success",
                    timestamp: tx.date ? (tx.date + 946684800) * 1000 : Date.now(), // Ripple epoch starts Jan 1, 2000
                    date: tx.date ? new Date((tx.date + 946684800) * 1000) : new Date(),
                });
            }

            return results;
        } catch (error: any) {
            console.error("Failed to fetch XRP history:", error.message);
            return [];
        }
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
                amount: Number(transaction.amount),
            });
        } catch (error: any) {
            console.error("Transaction webhook failed:", error.message);
        }
    }
}
