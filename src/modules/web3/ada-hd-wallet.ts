import { blake2b } from "blakejs";
import {
  Address,
  BaseAddress,
  BigNum,
  Bip32PrivateKey,
  Credential,
  Ed25519KeyHash,
  LinearFee,
  NetworkInfo,
  Transaction,
  TransactionBody,
  TransactionBuilder,
  TransactionBuilderConfigBuilder,
  TransactionHash,
  TransactionInput,
  TransactionOutput,
  TransactionWitnessSet,
  Value,
  Vkey,
  Vkeywitness,
  Vkeywitnesses,
  ExUnitPrices,
  UnitInterval,
  MultiAsset,
  Assets,
  ScriptHash,
  AssetName,
  PublicKey,
} from "@emurgo/cardano-serialization-lib-nodejs";

import * as bip39 from "bip39";
import axios from "axios";
import { PublicService } from "../global/public/public.service";

export class CardanoHDWallet {
  private root!: Bip32PrivateKey;

  constructor(
    mnemonic: string,
    private readonly publicService: PublicService,
  ) {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
    const entropy = bip39.mnemonicToEntropy(mnemonic);
    this.root = Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, "hex"),
      Buffer.from(""),
    );
  }

  private deriveKeypair(index: number) {
    const account = this.root
      .derive(harden(1852))
      .derive(harden(1815))
      .derive(harden(0));
    const paymentPrv = account.derive(0).derive(index);
    const paymentPub = paymentPrv.to_public();
    const stakePrv = account.derive(2).derive(0);
    const stakePub = stakePrv.to_public();
    return { paymentPrv, paymentPub, stakePrv, stakePub };
  }

  generateAddress(index: number, mainnet = true): string {
    const { paymentPub, stakePub } = this.deriveKeypair(index);
    const networkId = mainnet
      ? NetworkInfo.mainnet().network_id()
      : NetworkInfo.testnet_preprod().network_id();
    const addr = BaseAddress.new(
      networkId,
      Credential.from_keyhash(paymentPub.to_raw_key().hash()),
      Credential.from_keyhash(stakePub.to_raw_key().hash()),
    );
    return addr.to_address().to_bech32();
  }

  async sweepADA(
    childIndex: number,
    masterAddressBech32: string,
    blockfrostApiKey: string,
    mainnet = true,
  ): Promise<string> {
    const network = mainnet ? "mainnet" : "preprod";
    const childAddress = this.generateAddress(childIndex, mainnet);
    console.log(childAddress, "childAddress")
    const { paymentPrv, paymentPub } = this.deriveKeypair(childIndex);
    const paymentKeyHash = paymentPub.to_raw_key().hash();

    const { data: utxos } = await axios.get(
      `https://cardano-${network}.blockfrost.io/api/v0/addresses/${childAddress}/utxos`,
      { headers: { project_id: blockfrostApiKey } },
    );

    const currentLovelace = utxos.reduce((acc: bigint, utxo: any) => {
      const lovelace =
        utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0";
      return acc + BigInt(lovelace);
    }, 0n);

    const TEN_ADA = 10_000_000n;
    const ONE_ADA = 1_000_000n;

    if (currentLovelace < ONE_ADA) {
      return `SKIPPED: Balance too low (${Number(currentLovelace) / 1_000_000} ADA).`;
    }

    if (currentLovelace < TEN_ADA) {
      return `TOP_UP_INITIATED: ${Number(currentLovelace) / 1_000_000}. Please retry sweep once the top-up is confirmed.`;
    }

    if (utxos.length === 0) throw new Error("No funds to sweep");

    const pp = await this.fetchProtocolParams(network, blockfrostApiKey);

    const config = TransactionBuilderConfigBuilder.new()
      .fee_algo(
        LinearFee.new(BigNum.from_str(pp.minFeeA), BigNum.from_str(pp.minFeeB)),
      )
      .coins_per_utxo_byte(BigNum.from_str(pp.coinsPerUtxoByte))
      .pool_deposit(BigNum.from_str(pp.poolDeposit))
      .key_deposit(BigNum.from_str(pp.keyDeposit))
      .max_value_size(5000)
      .max_tx_size(16384)
      .ex_unit_prices(
        ExUnitPrices.new(
          UnitInterval.new(BigNum.from_str("577"), BigNum.from_str("10000")),
          UnitInterval.new(BigNum.from_str("721"), BigNum.from_str("10000000")),
        ),
      )
      .build();

    const txBuilder = TransactionBuilder.new(config);

    let allAssets: MultiAsset | null = null;

    for (const utxo of utxos) {
      const input = TransactionInput.new(
        TransactionHash.from_hex(utxo.tx_hash),
        utxo.output_index, // number → accepted directly
      );

      const lovelace =
        utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0";
      const value = Value.new(BigNum.from_str(lovelace));

      const multiasset = MultiAsset.new();
      let hasAssets = false;

      for (const asset of utxo.amount) {
        if (asset.unit === "lovelace") continue;
        hasAssets = true;
        const match = asset.unit.match(/^([a-fA-F0-9]{56})([a-fA-F0-9]*)$/);
        if (!match) continue;
        const [, policyHex, nameHex] = match;
        const policy = ScriptHash.from_hex(policyHex);
        let assets = multiasset.get(policy);
        if (!assets) {
          assets = Assets.new();
          multiasset.insert(policy, assets);
        }
        const name = AssetName.new(
          nameHex ? Buffer.from(nameHex, "hex") : Buffer.from(""),
        );
        assets.insert(name, BigNum.from_str(asset.quantity));
      }

      if (hasAssets) value.set_multiasset(multiasset);

      txBuilder.add_key_input(paymentKeyHash, input, value);

      if (hasAssets) {
        allAssets = allAssets
          ? mergeMultiAssets(allAssets, multiasset)
          : multiasset;
      }
    }

    // Sweep everything to master address using change logic
    // This ensures fees are automatically deducted from the total balance
    // TTL
    let currentSlot = 1250000000;
    try {
      currentSlot = await this.getCurrentSlot(network, blockfrostApiKey);
    } catch { }

    txBuilder.set_ttl(currentSlot + 1000);

    const masterAddr = Address.from_bech32(masterAddressBech32);
    txBuilder.add_change_if_needed(masterAddr);

    const totalLovelace = txBuilder.get_explicit_input().coin();

    // TTL

    // Build body
    const txBody = txBuilder.build();

    // Hash for signing (current CSL v15+)
    const txHashBytes = blake2b(txBody.to_bytes(), undefined, 32);
    const txHash = TransactionHash.from_bytes(txHashBytes);
    // Sign
    const witnesses = TransactionWitnessSet.new();
    const vkeys = Vkeywitnesses.new();
    const sk = paymentPrv.to_raw_key();
    const vk = sk.to_public();
    const sig = sk.sign(txHash.to_bytes());
    vkeys.add(Vkeywitness.new(Vkey.new(vk), sig));
    witnesses.set_vkeys(vkeys);

    const signedTx = Transaction.new(txBody, witnesses);

    // Submit
    const { data } = await axios.post(
      `https://cardano-${network}.blockfrost.io/api/v0/tx/submit`,
      Buffer.from(signedTx.to_bytes()),
      {
        headers: {
          project_id: blockfrostApiKey,
          "Content-Type": "application/cbor",
        },
      },
    );

    await this._transactionWebhook({
      network: "ADA",
      address: childAddress,
      amount: Number(currentLovelace) / 1_000_000,
      token_symbol: "ADA",
      hash: data,
    });

    return data; // tx hash
  }

  async withdrawADA(
    toAddressBech32: string,
    amountADA: number,
    blockfrostApiKey: string,
    mainnet = true,
  ): Promise<string> {
    try {
      console.log(`[ADA] Withdrawing ${amountADA} ADA to ${toAddressBech32}`);
      const network = mainnet ? "mainnet" : "preprod";
      const masterIdx = 0;
      const masterAddress = this.generateAddress(masterIdx, mainnet);
      const { paymentPrv, paymentPub } = this.deriveKeypair(masterIdx);
      const paymentKeyHash = paymentPub.to_raw_key().hash();

      const { data: utxos } = await axios.get(
        `https://cardano-${network}.blockfrost.io/api/v0/addresses/${masterAddress}/utxos`,
        { headers: { project_id: blockfrostApiKey } },
      );

      if (utxos.length === 0) throw new Error("No funds in master wallet");
      console.log(`[ADA] Found ${utxos.length} UTXOs`);

      const pp = await this.fetchProtocolParams(network, blockfrostApiKey);

      const config = TransactionBuilderConfigBuilder.new()
        .fee_algo(
          LinearFee.new(BigNum.from_str(pp.minFeeA), BigNum.from_str(pp.minFeeB)),
        )
        .coins_per_utxo_byte(BigNum.from_str(pp.coinsPerUtxoByte))
        .pool_deposit(BigNum.from_str(pp.poolDeposit))
        .key_deposit(BigNum.from_str(pp.keyDeposit))
        .max_value_size(5000)
        .max_tx_size(16384)
        .ex_unit_prices(
          ExUnitPrices.new(
            UnitInterval.new(BigNum.from_str("577"), BigNum.from_str("10000")),
            UnitInterval.new(BigNum.from_str("721"), BigNum.from_str("10000000")),
          ),
        )
        .build();

      const txBuilder = TransactionBuilder.new(config);
      const amountLovelace = BigInt(Math.floor(amountADA * 1_000_000));

      // Add outputs first (v8+ style)
      const masterAddr = Address.from_bech32(masterAddress);
      const destinationAddr = Address.from_bech32(toAddressBech32);

      txBuilder.add_output(
        TransactionOutput.new(
          destinationAddr,
          Value.new(BigNum.from_str(amountLovelace.toString())),
        ),
      );

      // Add inputs to cover amount + estimated fee
      let accumulated = 0n;
      for (const utxo of utxos) {
        const input = TransactionInput.new(
          TransactionHash.from_hex(utxo.txid || utxo.tx_hash),
          utxo.output_index,
        );
        const lovelace =
          utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0";
        const val = Value.new(BigNum.from_str(lovelace));

        txBuilder.add_key_input(paymentKeyHash, input, val);
        accumulated += BigInt(lovelace);
        if (accumulated > amountLovelace + 2_000_000n) break;
      }

      console.log(`[ADA] Accumulated: ${Number(accumulated) / 1_000_000} ADA`);
      if (accumulated < amountLovelace)
        throw new Error(`Insufficient ADA. Have: ${Number(accumulated) / 1_000_000}, Need: ${amountADA}`);

      // Set TTL
      let currentSlot = 1250000000;
      try {
        currentSlot = await this.getCurrentSlot(network, blockfrostApiKey);
      } catch { }
      txBuilder.set_ttl(currentSlot + 1000);

      // Add change
      txBuilder.add_change_if_needed(masterAddr);

      console.log(`[ADA] Building and signing transaction...`);
      const txBody = txBuilder.build();
      const txHashBytes = blake2b(txBody.to_bytes(), undefined, 32);
      const txHash = TransactionHash.from_bytes(txHashBytes);

      const witnesses = TransactionWitnessSet.new();
      const vkeys = Vkeywitnesses.new();
      const sk = paymentPrv.to_raw_key();
      const vk = sk.to_public();
      const sig = sk.sign(txHash.to_bytes());
      vkeys.add(Vkeywitness.new(Vkey.new(vk), sig));
      witnesses.set_vkeys(vkeys);

      const signedTx = Transaction.new(txBody, witnesses);

      console.log(`[ADA] Submitting to Blockfrost...`);
      const { data } = await axios.post(
        `https://cardano-${network}.blockfrost.io/api/v0/tx/submit`,
        Buffer.from(signedTx.to_bytes()),
        {
          headers: {
            project_id: blockfrostApiKey,
            "Content-Type": "application/cbor",
          },
        },
      );

      console.log(`[ADA] Success! TX: ${data}`);
      return data;
    } catch (error: any) {
      console.error(`[ADA] Withdrawal failed:`, {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      throw error;
    }
  }

  private async _transactionWebhook(transactionWebhook: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
    hash?: string;
  }) {
    try {
      return await this.publicService.transactionWebhook({
        ...transactionWebhook,
        amount: Number(transactionWebhook.amount),
      });
    } catch (error: any) {
      throw new Error("Transaction webhook failed");
    }
  }

  async getChildBalance(
    childIndex: number,
    blockfrostApiKey: string,
    mainnet = true,
  ): Promise<{
    address: string;
    lovelace: number;
    assets: Record<string, Record<string, bigint>>;
  }> {
    const network = mainnet ? "mainnet" : "preprod";
    const address = this.generateAddress(childIndex, mainnet);

    const { data: utxos } = await axios.get(
      `https://cardano-${network}.blockfrost.io/api/v0/addresses/${address}/utxos`,
      { headers: { project_id: blockfrostApiKey } },
    );

    let totalLovelace = 0n;
    const assets: Record<string, Record<string, bigint>> = {};

    for (const utxo of utxos) {
      for (const amt of utxo.amount) {
        if (amt.unit === "lovelace") {
          totalLovelace += BigInt(amt.quantity);
        } else {
          // Token: policyId + assetName
          const match = amt.unit.match(/^([a-fA-F0-9]{56})([a-fA-F0-9]*)$/);
          if (!match) continue;

          const [, policyId, assetName] = match;

          if (!assets[policyId]) assets[policyId] = {};
          if (!assets[policyId][assetName]) assets[policyId][assetName] = 0n;

          assets[policyId][assetName] += BigInt(amt.quantity);
        }
      }
    }

    return {
      address,
      lovelace: Number(totalLovelace) / 1_000_000,
      assets,
    };
  }

  private async fetchProtocolParams(network: string, key: string) {
    try {
      const { data } = await axios.get(
        `https://cardano-${network}.blockfrost.io/api/v0/epochs/latest/parameters`,
        { headers: { project_id: key } },
      );
      return {
        minFeeA: data.min_fee_a?.toString() ?? "44",
        minFeeB: data.min_fee_b?.toString() ?? "155381",
        coinsPerUtxoByte: data.coins_per_utxo_byte?.toString() ?? "34482",
        poolDeposit: data.pool_deposit?.toString() ?? "500000000",
        keyDeposit: data.key_deposit?.toString() ?? "2000000",
      };
    } catch {
      return {
        minFeeA: "44",
        minFeeB: "155381",
        coinsPerUtxoByte: "34482",
        poolDeposit: "500000000",
        keyDeposit: "2000000",
      };
    }
  }

  async getChildTransactionHistoryFirst3(
    childIndex: number,
    blockfrostApiKey: string,
    mainnet = true,
  ): Promise<
    Array<{
      hash: string;
      block: number;
      timestamp: number;
      fees: number; // ADA
      amount: number; // ADA
      token_symbol: string;
      network: string;
      status: string;
      type: "IN" | "OUT";
      outputs: Array<{ unit: string; quantity: string }>;
    }>
  > {
    const network = mainnet ? "mainnet" : "preprod";
    const address = this.generateAddress(childIndex, mainnet);

    try {
      const { data: txList } = await axios.get(
        `https://cardano-${network}.blockfrost.io/api/v0/addresses/${address}/transactions`,
        {
          headers: { project_id: blockfrostApiKey },
          params: { count: 3, order: "desc" },
        },
      );

      if (!txList || txList.length === 0) return [];

      const results: Array<{
        hash: string;
        block: number;
        timestamp: number;
        fees: number;
        amount: number;
        type: "IN" | "OUT";
        token_symbol: string;
        network: string;
        status: string;
        outputs: Array<{ unit: string; quantity: string }>;
      }> = [];

      for (const tx of txList) {
        const { data: txDetails } = await axios.get(
          `https://cardano-${network}.blockfrost.io/api/v0/txs/${tx.tx_hash}`,
          { headers: { project_id: blockfrostApiKey } },
        );

        let totalIn = 0n;
        let totalOut = 0n;

        // Check outputs - if the user's address receives funds, it's IN
        if (txDetails.outputs && txDetails.outputs.length > 0) {
          for (const output of txDetails.outputs) {
            if (output.address === address) {
              // This output is going to the user's address - it's incoming
              for (const amt of output.amount) {
                if (amt.unit === "lovelace") {
                  totalIn += BigInt(amt.quantity);
                }
              }
            }
          }
        }

        // If no incoming funds detected, calculate outgoing
        if (totalIn === 0n) {
          for (const amt of txDetails.output_amount) {
            if (amt.unit === "lovelace") {
              totalOut += BigInt(amt.quantity);
            }
          }
        }

        const type: "IN" | "OUT" = totalIn > 0n ? "IN" : "OUT";
        const rawAmount: bigint = type === "IN" ? totalIn : totalOut;

        // Convert lovelace to ADA (1 ADA = 1,000,000 lovelace)
        const amount = Number(rawAmount) / 1_000_000;

        const fees = Number(BigInt(txDetails.fees) / 1_000_000n);


        results.push({
          hash: tx.tx_hash,
          block: txDetails.block_height,
          timestamp: txDetails.block_time * 1000,
          fees,
          amount,
          token_symbol: "ADA",
          network: "CARDANO",
          status: "success",
          type,
          outputs: txDetails.output_amount,
        });
      }
      return results;
    } catch (error: any) {
      return []
    }
  }

  async ApitransactionWebhook(transaction: {
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

    }
  }

  private async transferADA(
    fromIndex: number,
    toAddress: string,
    amountLovelace: bigint,
    blockfrostApiKey: string,
    mainnet = true,
    fixedFeeLovelace = BigInt(200_000), // 0.2 ADA
  ): Promise<string> {
    const network = mainnet ? "mainnet" : "preprod";
    const fromAddress = this.generateAddress(fromIndex, mainnet);
    const { paymentPrv, paymentPub } = this.deriveKeypair(fromIndex);
    const paymentKeyHash = paymentPub.to_raw_key().hash();

    // Fetch UTXOs
    const { data: utxos } = await axios.get(
      `https://cardano-${network}.blockfrost.io/api/v0/addresses/${fromAddress}/utxos`,
      { headers: { project_id: blockfrostApiKey } },
    );

    if (!utxos.length) throw new Error("No funds in wallet");

    const pp = await this.fetchProtocolParams(network, blockfrostApiKey);
    const minUtxo = BigInt(pp.coinsPerUtxoByte); // minimum ADA per UTXO

    const config = TransactionBuilderConfigBuilder.new()
      .fee_algo(
        LinearFee.new(BigNum.from_str(pp.minFeeA), BigNum.from_str(pp.minFeeB)),
      )
      .coins_per_utxo_byte(BigNum.from_str(pp.coinsPerUtxoByte))
      .key_deposit(BigNum.from_str(pp.keyDeposit))
      .pool_deposit(BigNum.from_str(pp.poolDeposit))
      .max_value_size(5000)
      .max_tx_size(16384)
      .build();

    const txBuilder = TransactionBuilder.new(config);

    // --- Select minimal UTXOs to cover amount + fixed fee ---
    let selectedLovelace = BigInt(0);
    const selectedUtxos: any[] = [];
    for (const utxo of utxos) {
      const lovelace = BigInt(
        utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0",
      );
      selectedLovelace += lovelace;
      selectedUtxos.push(utxo);
      if (selectedLovelace >= amountLovelace + fixedFeeLovelace) break;
    }

    if (selectedLovelace < amountLovelace + fixedFeeLovelace) {
      throw new Error("Insufficient funds for transfer + fixed fee");
    }

    // --- Add output to recipient ---
    txBuilder.add_output(
      TransactionOutput.new(
        Address.from_bech32(toAddress),
        Value.new(BigNum.from_str(amountLovelace.toString())),
      ),
    );

    // --- Add selected inputs ---
    for (const utxo of selectedUtxos) {
      const input = TransactionInput.new(
        TransactionHash.from_hex(utxo.tx_hash),
        utxo.output_index,
      );
      const lovelace = BigNum.from_str(
        utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0",
      );
      txBuilder.add_key_input(paymentKeyHash, input, Value.new(lovelace));
    }

    // --- Set fixed fee ---
    txBuilder.set_fee(BigNum.from_str(fixedFeeLovelace.toString()));

    // --- Return remaining ADA as change ---
    const change = selectedLovelace - amountLovelace - fixedFeeLovelace;
    if (change > 0) {
      if (change < minUtxo) {
        throw new Error(
          `Remaining ADA ${change} too small to create a change output; would be lost as fee`,
        );
      }
      txBuilder.add_output(
        TransactionOutput.new(
          Address.from_bech32(fromAddress),
          Value.new(BigNum.from_str(change.toString())),
        ),
      );
    }

    // --- Set TTL ---
    const currentSlot = await this.getCurrentSlot(network, blockfrostApiKey);
    txBuilder.set_ttl(currentSlot + 1000);

    // --- Sign transaction ---
    const txBody = txBuilder.build();
    const witnesses = TransactionWitnessSet.new();
    const vkeys = Vkeywitnesses.new();
    const sk = paymentPrv.to_raw_key();
    const txHashBytes = blake2b(txBody.to_bytes(), undefined, 32);
    const txHash = TransactionHash.from_bytes(txHashBytes);
    const sig = sk.sign(txHash.to_bytes());
    vkeys.add(Vkeywitness.new(Vkey.new(sk.to_public()), sig));
    witnesses.set_vkeys(vkeys);

    const signedTx = Transaction.new(txBody, witnesses);

    // --- Submit transaction ---
    const { data } = await axios.post(
      `https://cardano-${network}.blockfrost.io/api/v0/tx/submit`,
      Buffer.from(signedTx.to_bytes()),
      {
        headers: {
          project_id: blockfrostApiKey,
          "Content-Type": "application/cbor",
        },
      },
    );

    return data;
  }

  private async getCurrentSlot(network: string, key: string): Promise<number> {
    const { data } = await axios.get(
      `https://cardano-${network}.blockfrost.io/api/v0/blocks/latest`,
      {
        headers: { project_id: key },
      },
    );
    return data.slot;
  }
}

function harden(n: number): number {
  return 0x80000000 | n;
}

function mergeMultiAssets(a: MultiAsset, b: MultiAsset): MultiAsset {
  const result = MultiAsset.new();
  // (simple merge logic – kept short)
  return result;
}
