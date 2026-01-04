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

    async getMasterAddress(): Promise<string> {
        const wallet = await this.getMasterWallet();
        return wallet.address;
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
    async withdrawXRP(toAddress: string, amount: number, destinationTag?: number): Promise<string> {
        await this.ensureConnected();
        const masterWallet = await this.getMasterWallet();

        const prepared = await this.client.autofill({
            TransactionType: "Payment",
            Account: masterWallet.address,
            Amount: xrpToDrops(amount),
            Destination: toAddress,
            DestinationTag: destinationTag,
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
     * Sweep XRP (for legacy child accounts)
     */
    async sweepXRP(index: number, masterAddress: string): Promise<boolean> {
        await this.ensureConnected();
        const childWallet = await this.deriveWallet(index);
        const balance = await this.getBalance(childWallet.address);

        if (balance <= 10.001) {
            return false;
        }

        const transferable = balance - 10 - 0.00002;

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
                hash: signed.hash,
            });
            return true;
        }

        return false;
    }

    async getChildTransactionHistory(address: string, destinationTag: number, limit: number = 3): Promise<any[]> {
        await this.ensureConnected();

        try {
            const response = await this.client.request({
                command: "account_tx",
                account: address,
                limit: 50,
            });

            const transactions = response.result.transactions;
            const results: any[] = [];

            for (const txObj of transactions) {
                if (results.length >= limit) break;

                const tx: any = txObj.tx;
                const meta: any = txObj.meta;

                // Skip if not a successful Payment
                if (tx.TransactionType !== "Payment" || meta.TransactionResult !== "tesSUCCESS") continue;

                // Filter by Destination and DestinationTag
                if (tx.Destination !== address || tx.DestinationTag !== destinationTag) continue;

                let amount = 0;
                if (typeof tx.Amount === "string") {
                    amount = Number(dropsToXrp(tx.Amount));
                } else {
                    continue;
                }

                results.push({
                    txID: tx.hash,
                    type: "IN",
                    amount: amount,
                    token_symbol: "XRP",
                    network: "RIPPLE",
                    status: "success",
                    timestamp: tx.date ? (tx.date + 946684800) * 1000 : Date.now(),
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
        hash?: string;
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
