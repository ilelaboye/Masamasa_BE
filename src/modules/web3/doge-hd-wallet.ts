import * as bitcoin from "bitcoinjs-lib";
import * as bip39 from "bip39";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import { PublicService } from "../global/public/public.service";

const bip32 = BIP32Factory(ecc);

const DOGECOIN: bitcoin.Network = {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bech32: 'dc', // Dogecoin doesn't typically use bech32
    bip32: {
        public: 0x02facafd,
        private: 0x02fac398,
    },
    pubKeyHash: 0x1e, // Addresses start with D
    scriptHash: 0x16, // Addresses start with 9 or A
    wif: 0x9e,
};

export class DogeHDWallet {
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
        // Dogecoin testnet: pubKeyHash 0x71, scriptHash 0xc4, wif 0xf1
        this.network = testnet
            ? {
                messagePrefix: '\x19Dogecoin Signed Message:\n',
                bech32: 'tdge',
                bip32: {
                    public: 0x043587cf,
                    private: 0x04358394,
                },
                pubKeyHash: 0x71,
                scriptHash: 0xc4,
                wif: 0xf1,
            }
            : DOGECOIN;
        this.seed = bip39.mnemonicToSeedSync(mnemonic);
        this.root = bip32.fromSeed(this.seed, this.network);
        this.publicService = publicService;
    }

    /**
     * Derive legacy address m/44'/3'/0'/0/index
     */
    generateAddress(index: number): string {
        const path = `m/44'/3'/0'/0/${index}`;
        const child = this.root.derivePath(path);
        const { address } = bitcoin.payments.p2pkh({
            pubkey: child.publicKey,
            network: this.network,
        });
        if (!address) throw new Error("Failed to generate address");
        return address;
    }

    /**
     * Get balance in DOGE
     */
    async getBalance(address: string): Promise<number> {
        // Using BlockCypher for DOGE
        const baseUrl = `https://api.blockcypher.com/v1/doge/main`;

        try {
            const { data } = await axios.get(`${baseUrl}/addrs/${address}/balance`);
            return data.balance / 1e8;
        } catch (error: any) {
            console.error("Failed to fetch DOGE balance:", error.message);
            // Fallback to SoChain
            try {
                const { data } = await axios.get(`https://sochain.com/api/v2/get_address_balance/DOGE/${address}`);
                return Number(data.data.confirmed_balance);
            } catch (err) {
                return 0;
            }
        }
    }

    /**
     * Sweep DOGE from child to master
     */
    async sweepDOGE(
        childIndex: number,
        masterAddress: string,
    ): Promise<string | null> {
        const childAddress = this.generateAddress(childIndex);
        const path = `m/44'/3'/0'/0/${childIndex}`;
        const childNode = this.root.derivePath(path);
        console.log(childAddress);
        const baseUrl = `https://api.blockcypher.com/v1/doge/main`;

        // 1. Get UTXOs
        try {
            const { data: addrInfo } = await axios.get(
                `${baseUrl}/addrs/${childAddress}?unspentOnly=true`,
            );
            const utxos = addrInfo.txrefs;
            if (!utxos || utxos.length === 0) return null;

            // 2. Build Transaction
            const psbt = new bitcoin.Psbt({ network: this.network });
            // DOGE often requires older transaction formats but bitcoinjs-lib Psbt should handle legacy P2PKH

            let totalInput = BigInt(0);

            console.log(utxos);


            for (const utxo of utxos) {
                // blockcypher returns value in satoshis
                // We need the full transaction hex to add input for non-segwit transactions if we want to be safe, 
                // or we can use the value and scriptPubKey.
                // For P2PKH, we need nonWitnessUtxo.
                const { data: txHex } = await axios.get(`${baseUrl}/txs/${utxo.tx_hash}?includeHex=true`);

                psbt.addInput({
                    hash: utxo.tx_hash,
                    index: utxo.tx_output_n,
                    nonWitnessUtxo: Buffer.from(txHex.hex, 'hex'),
                });
                totalInput += BigInt(utxo.value);
            }

            // 3. Estimate Fee
            const feeRate = 1000000; // 1 DOGE per KB is common, so ~1000 sat/vB? Actually DOGE fees are low.
            // Let's use a standard 1 DOGE fee for simplicity or calculate.
            const estimatedSize = utxos.length * 148 + 1 * 34 + 10;
            const fee = BigInt(Math.ceil(estimatedSize * 1000)); // 1000 sat/vB = 0.01 DOGE/KB? 
            // Dogecoin recommended fee is 0.01 DOGE per KB now, but some APIs might require 1 DOGE.

            const sendAmount = totalInput - fee;
            if (sendAmount <= BigInt(100000000)) { // 1 DOGE dust limit for safety
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
            const { data: broadcastRes } = await axios.post(`${baseUrl}/txs/push`, { tx: txHex });
            const txid = broadcastRes.tx.hash;

            await this._transactionWebhook({
                network: "DOGE",
                address: childAddress,
                amount: Number(sendAmount) / 1e8,
                token_symbol: "DOGE",
                hash: txid,
            });

            return txid;
        } catch (error: any) {
            console.error(
                "Failed to broadcast DOGE transaction:",
                error.response?.data || error.message,
            );
            return null;
        }
    }

    /**
     * Withdraw DOGE from master to any address
     */
    async withdrawDOGE(
        masterAddress: string,
        toAddress: string,
        amountDOGE: number,
    ): Promise<string> {
        const masterIdx = 0;
        const masterNode = this.root.derivePath(`m/44'/3'/0'/0/${masterIdx}`);
        const masterAddr = this.generateAddress(masterIdx);

        if (masterAddr !== masterAddress) {
            console.warn("Derived master address mismatch");
        }

        const baseUrl = `https://api.blockcypher.com/v1/doge/main`;

        // 1. Get UTXOs
        const { data: addrInfo } = await axios.get(
            `${baseUrl}/addrs/${masterAddr}?unspentOnly=true`,
        );
        const utxos = addrInfo.txrefs;
        if (!utxos || utxos.length === 0) throw new Error("No funds in master wallet");

        // 2. Build Transaction
        const psbt = new bitcoin.Psbt({ network: this.network });
        let totalInput = BigInt(0);
        const sendAmountSat = BigInt(Math.floor(amountDOGE * 1e8));

        let inputCount = 0;
        for (const utxo of utxos) {
            const { data: txHex } = await axios.get(`${baseUrl}/txs/${utxo.tx_hash}?includeHex=true`);
            psbt.addInput({
                hash: utxo.tx_hash,
                index: utxo.tx_output_n,
                nonWitnessUtxo: Buffer.from(txHex.hex, 'hex'),
            });
            totalInput += BigInt(utxo.value);
            inputCount++;
            if (totalInput > sendAmountSat + BigInt(200000000)) break; // 2 DOGE buffer
        }

        if (totalInput < sendAmountSat) throw new Error("Insufficient DOGE balance");

        // 3. Estimate Fee
        const estimatedSize = inputCount * 148 + 2 * 34 + 10;
        const fee = BigInt(Math.ceil(estimatedSize * 1000));

        if (totalInput < sendAmountSat + fee) throw new Error("Insufficient balance for fee");

        // 4. Add Outputs
        psbt.addOutput({
            address: toAddress,
            value: sendAmountSat,
        });

        const change = totalInput - sendAmountSat - fee;
        if (change > BigInt(100000000)) { // 1 DOGE change limit
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
        const { data: broadcastRes } = await axios.post(`${baseUrl}/txs/push`, { tx: txHex });
        return broadcastRes.tx.hash;
    }

    async getChildTransactionHistory(
        childIndex: number,
        limit: number = 3,
    ): Promise<any[]> {
        const address = this.generateAddress(childIndex);
        const baseUrl = `https://api.blockcypher.com/v1/doge/main`;

        try {
            const { data } = await axios.get(`${baseUrl}/addrs/${address}/full?limit=${limit}`);
            if (!data.txs) return [];

            return data.txs.map((tx: any) => {
                let totalIn = 0;
                tx.outputs.forEach((output: any) => {
                    if (output.addresses && output.addresses.includes(address)) {
                        totalIn += output.value;
                    }
                });

                return {
                    txID: tx.hash,
                    type: totalIn > 0 ? "IN" : "OUT",
                    amount: totalIn / 1e8,
                    address: address,
                    token_symbol: "DOGE",
                    network: "DOGE",
                    status: tx.confirmations > 0 ? "success" : "pending",
                    timestamp: new Date(tx.confirmed).getTime(),
                    date: new Date(tx.confirmed),
                };
            }).filter((t: any) => t.type === "IN");
        } catch (error: any) {
            console.error("Failed to fetch DOGE history:", error.message);
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
            console.error("DOGE transaction webhook failed:", error.message);
        }
    }
}
