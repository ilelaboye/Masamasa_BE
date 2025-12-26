import * as bitcoin from "bitcoinjs-lib";
import * as bip39 from "bip39";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import { PublicService } from "../global/public/public.service";

const bip32 = BIP32Factory(ecc);

export class BtcHDWallet {
    private mnemonic: string;
    private seed: Buffer;
    private root: BIP32Interface;
    private network: bitcoin.Network;
    private readonly publicService: PublicService;

    constructor(mnemonic: string, testnet = false, publicService: PublicService) {
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error("Invalid mnemonic");
        }
        this.mnemonic = mnemonic;
        this.network = testnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
        this.seed = bip39.mnemonicToSeedSync(mnemonic);
        this.root = bip32.fromSeed(this.seed, this.network);
        this.publicService = publicService;
    }

    /**
     * Derive Native SegWit (Bech32) address m/84'/0'/0'/0/index
     */
    generateAddress(index: number): string {
        const coinType = this.network === bitcoin.networks.testnet ? "1" : "0";
        const path = `m/84'/${coinType}'/0'/0/${index}`;
        const child = this.root.derivePath(path);
        const { address } = bitcoin.payments.p2wpkh({
            pubkey: child.publicKey,
            network: this.network,
        });
        if (!address) throw new Error("Failed to generate address");
        return address;
    }

    /**
     * Get balance in BTC
     */
    async getBalance(address: string): Promise<number> {
        const baseUrl = this.network === bitcoin.networks.testnet
            ? "https://blockstream.info/testnet/api"
            : "https://blockstream.info/api";

        try {
            const { data } = await axios.get(`${baseUrl}/address/${address}`);
            const balanceSat = (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum);
            return balanceSat / 1e8;
        } catch (error: any) {
            console.error("Failed to fetch BTC balance:", error.message);
            return 0;
        }
    }

    /**
     * Sweep BTC from child to master
     */
    async sweepBTC(
        childIndex: number,
        masterAddress: string,
    ): Promise<string | null> {
        const childAddress = this.generateAddress(childIndex);
        const coinType = this.network === bitcoin.networks.testnet ? "1" : "0";
        const path = `m/84'/${coinType}'/0'/0/${childIndex}`;
        const childNode = this.root.derivePath(path);

        const baseUrl = this.network === bitcoin.networks.testnet
            ? "https://blockstream.info/testnet/api"
            : "https://blockstream.info/api";

        // 1. Get UTXOs
        const { data: utxos } = await axios.get(`${baseUrl}/address/${childAddress}/utxo`);
        if (!utxos || utxos.length === 0) return null;

        // 2. Build Transaction
        const psbt = new bitcoin.Psbt({ network: this.network });
        let totalInput = BigInt(0);

        for (const utxo of utxos) {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: bitcoin.address.toOutputScript(childAddress, this.network),
                    value: BigInt(utxo.value),
                },
            });
            totalInput += BigInt(utxo.value);
        }

        // 3. Estimate Fee (simple estimation)
        const feeRate = await this.getFeeRate();
        const estimatedSize = utxos.length * 68 + 1 * 31 + 10; // Simple estimation for P2WPKH
        const fee = BigInt(Math.ceil(estimatedSize * feeRate));

        const sendAmount = totalInput - fee;
        if (sendAmount <= BigInt(546)) { // Dust limit
            console.log("Balance too low to sweep (dust or fee exceeds balance)");
            return null;
        }

        psbt.addOutput({
            address: masterAddress,
            value: sendAmount,
        });

        // 4. Sign inputs
        utxos.forEach((_, i) => {
            psbt.signInput(i, childNode);
        });

        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();

        // 5. Broadcast
        try {
            const { data: txid } = await axios.post(`${baseUrl}/tx`, txHex);

            await this._transactionWebhook({
                network: "BTC",
                address: childAddress,
                amount: Number(sendAmount) / 1e8,
                token_symbol: "BTC",
            });

            return txid;
        } catch (error: any) {
            console.error("Failed to broadcast BTC transaction:", error.response?.data || error.message);
            throw new Error("BTC broadcast failed");
        }
    }

    /**
     * Withdraw BTC from master to any address
     */
    async withdrawBTC(
        masterAddress: string,
        toAddress: string,
        amountBTC: number
    ): Promise<string> {
        const masterIdx = 0;
        const masterNode = this.root.derivePath(`m/84'/${this.network === bitcoin.networks.testnet ? "1" : "0"}'/0'/0/${masterIdx}`);
        const masterAddr = this.generateAddress(masterIdx);

        if (masterAddr !== masterAddress) {
            console.warn("Provided master address does not match derived master address (index 0)");
        }

        const baseUrl = this.network === bitcoin.networks.testnet
            ? "https://blockstream.info/testnet/api"
            : "https://blockstream.info/api";

        // 1. Get UTXOs
        const { data: utxos } = await axios.get(`${baseUrl}/address/${masterAddr}/utxo`);
        if (!utxos || utxos.length === 0) throw new Error("No funds in master wallet");

        // 2. Build Transaction
        const psbt = new bitcoin.Psbt({ network: this.network });
        let totalInput = BigInt(0);
        const sendAmountSat = BigInt(Math.floor(amountBTC * 1e8));

        // Use enough UTXOs to cover sendAmount + fee
        let inputCount = 0;
        for (const utxo of utxos) {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: bitcoin.address.toOutputScript(masterAddr, this.network),
                    value: BigInt(utxo.value),
                },
            });
            totalInput += BigInt(utxo.value);
            inputCount++;
            if (totalInput > sendAmountSat + BigInt(10000)) break; // stop if we likely have enough (rough estimate)
        }

        if (totalInput < sendAmountSat) {
            throw new Error("Insufficient BTC balance in master wallet");
        }

        // 3. Estimate Fee
        const feeRate = await this.getFeeRate();
        const estimatedSize = inputCount * 68 + 2 * 31 + 10; // 2 outputs: toAddress & change
        const fee = BigInt(Math.ceil(estimatedSize * feeRate));

        if (totalInput < sendAmountSat + fee) {
            throw new Error(`Insufficient balance to cover amount + fee (${Number(fee) / 1e8} BTC)`);
        }

        // 4. Add Outputs
        psbt.addOutput({
            address: toAddress,
            value: sendAmountSat,
        });

        const change = totalInput - sendAmountSat - fee;
        if (change > BigInt(546)) {
            psbt.addOutput({
                address: masterAddr,
                value: change,
            });
        }

        // 5. Sign
        for (let i = 0; i < inputCount; i++) {
            psbt.signInput(i, masterNode);
        }

        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();

        // 6. Broadcast
        const { data: txid } = await axios.post(`${baseUrl}/tx`, txHex);
        return txid;
    }

    private async getFeeRate(): Promise<number> {
        const baseUrl = this.network === bitcoin.networks.testnet
            ? "https://blockstream.info/testnet/api"
            : "https://blockstream.info/api";
        try {
            const { data } = await axios.get(`${baseUrl}/fee-estimates`);
            // Use 1-block fee estimate or default to a safe value
            return data["1"] || 20;
        } catch {
            return 20; // fallback 20 sat/vB
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
                amount: Number(transaction.amount)
            });
        } catch (error: any) {
            console.error("BTC transaction webhook failed:", error.message);
        }
    }
}
