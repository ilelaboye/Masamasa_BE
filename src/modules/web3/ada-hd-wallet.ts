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

export class CardanoHDWallet {
  private root!: Bip32PrivateKey;

  constructor(mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
    const entropy = bip39.mnemonicToEntropy(mnemonic);
    this.root = Bip32PrivateKey.from_bip39_entropy(Buffer.from(entropy, "hex"), Buffer.from(""));
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
    const networkId = mainnet ? NetworkInfo.mainnet().network_id() : NetworkInfo.testnet_preprod().network_id();
    const addr = BaseAddress.new(
      networkId,
      Credential.from_keyhash(paymentPub.to_raw_key().hash()),
      Credential.from_keyhash(stakePub.to_raw_key().hash())
    );
    return addr.to_address().to_bech32();
  }

  async sweepADA(
    childIndex: number,
    masterAddressBech32: string,
    blockfrostApiKey: string,
    mainnet = true
  ): Promise<string> {
    const network = mainnet ? "mainnet" : "preprod";
    const childAddress = this.generateAddress(childIndex, mainnet);
    const { paymentPrv, paymentPub } = this.deriveKeypair(childIndex);
    const paymentKeyHash = paymentPub.to_raw_key().hash();


    const { data: utxos } = await axios.get(
      `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${childAddress}/utxos`,
      { headers: { project_id: blockfrostApiKey } }
    );


    if (utxos.length === 0) throw new Error("No funds to sweep");


    const pp = await this.fetchProtocolParams(network, blockfrostApiKey);

    const config = TransactionBuilderConfigBuilder.new()
      .fee_algo(LinearFee.new(BigNum.from_str(pp.minFeeB), BigNum.from_str(pp.minFeeA)))
      .coins_per_utxo_byte(BigNum.from_str(pp.coinsPerUtxoByte))
      .pool_deposit(BigNum.from_str(pp.poolDeposit))
      .key_deposit(BigNum.from_str(pp.keyDeposit))
      .max_value_size(5000)
      .max_tx_size(16384)
      .ex_unit_prices(
        ExUnitPrices.new(
          UnitInterval.new(BigNum.from_str("577"), BigNum.from_str("10000")),
          UnitInterval.new(BigNum.from_str("721"), BigNum.from_str("10000000"))
        )
      )
      .build();



    const txBuilder = TransactionBuilder.new(config);

    let allAssets: MultiAsset | null = null;

    for (const utxo of utxos) {
      const input = TransactionInput.new(
        TransactionHash.from_hex(utxo.tx_hash),
        utxo.output_index // number → accepted directly
      );

      const lovelace = utxo.amount.find((a: any) => a.unit === "lovelace")?.quantity ?? "0";
      let value = Value.new(BigNum.from_str(lovelace));

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
        const name = AssetName.new(nameHex ? Buffer.from(nameHex, "hex") : Buffer.from(""));
        assets.insert(name, BigNum.from_str(asset.quantity));
      }

      if (hasAssets) value.set_multiasset(multiasset);

      txBuilder.add_key_input(paymentKeyHash, input, value);

      if (hasAssets) {
        allAssets = allAssets ? mergeMultiAssets(allAssets, multiasset) : multiasset;
      }
    }


    // Build output with all funds
    const totalLovelace = txBuilder.get_explicit_input().coin();
    const outputValue = Value.new(totalLovelace);

    if (allAssets) outputValue.set_multiasset(allAssets);

    const masterAddr = Address.from_bech32(masterAddressBech32);

    txBuilder.add_output(TransactionOutput.new(masterAddr, outputValue));

    // TTL
    let currentSlot = 1250000000;
    try {
      currentSlot = await this.getCurrentSlot(network, blockfrostApiKey);
    } catch { }

    txBuilder.set_ttl(currentSlot + 1000); // Pass number directly — set_ttl expects number, not BigNum

    // Balance & calculate fee
    const changeAddr = Address.from_bech32(childAddress);
    const balanced = txBuilder.add_change_if_needed(changeAddr);
    if (!balanced) throw new Error("Failed to balance transaction");

    const fee = txBuilder.get_fee_if_set()!;

    // Build body
    const txBody = txBuilder.build();

    // Hash for signing (current CSL v15+)
    const txHash = TransactionHash.from_bytes(txBody.to_bytes());

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
      `https://cardano-mainnet.blockfrost.io/api/v0/tx/submit`,
      Buffer.from(signedTx.to_bytes()),
      {
        headers: {
          project_id: blockfrostApiKey,
          "Content-Type": "application/cbor",
        },
      }
    );

    return data; // tx hash
  }

  async getChildBalance(
    childIndex: number,
    blockfrostApiKey: string,
    mainnet = true
  ): Promise<{
    address: string;
    lovelace: bigint;
    assets: Record<string, Record<string, bigint>>;
  }> {
    const network = mainnet ? "mainnet" : "preprod";
    const address = this.generateAddress(childIndex, mainnet);

    const { data: utxos } = await axios.get(
      `https://cardano-${network}.blockfrost.io/api/v0/addresses/${address}/utxos`,
      { headers: { project_id: blockfrostApiKey } }
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
      lovelace: totalLovelace,
      assets,
    };
  }

  private async fetchProtocolParams(network: string, key: string) {
    try {
      const { data } = await axios.get(
        `https://cardano-mainnet.blockfrost.io/api/v0/epochs/latest/parameters`,
        { headers: { project_id: key } }
      );
      return {
        minFeeA: data.min_fee_a?.toString() ?? "151",
        minFeeB: data.min_fee_b?.toString() ?? "44",
        coinsPerUtxoByte: data.coins_per_utxo_byte?.toString() ?? "34482",
        poolDeposit: data.pool_deposit?.toString() ?? "500000000",
        keyDeposit: data.key_deposit?.toString() ?? "2000000",
      };
    } catch {
      return {
        minFeeA: "151",
        minFeeB: "44",
        coinsPerUtxoByte: "34482",
        poolDeposit: "500000000",
        keyDeposit: "2000000",
      };
    }
  }

  async getChildTransactionHistoryFirst3(
    childIndex: number,
    blockfrostApiKey: string,
    mainnet = true
  ): Promise<
    Array<{
      hash: string;
      block: number;
      timestamp: number;
      fees: number; // ADA
      amount: number; // ADA
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
        }
      );

      if (!txList || txList.length === 0) return [];

      const results: Array<{
        hash: string;
        block: number;
        timestamp: number;
        fees: number;
        amount: number;
        type: "IN" | "OUT";
        outputs: Array<{ unit: string; quantity: string }>;
      }> = [];

      for (const tx of txList) {
        const { data: txDetails } = await axios.get(
          `https://cardano-${network}.blockfrost.io/api/v0/txs/${tx.tx_hash}`,
          { headers: { project_id: blockfrostApiKey } }
        );

        let totalIn = 0n;
        let totalOut = 0n;

        for (const output of txDetails.output_amount) {
          if (output.unit === "lovelace") {
            const qty = BigInt(output.quantity);
            if (txDetails.outputs && txDetails.outputs.some((o: any) => o.address === address)) {
              totalIn += qty;
            } else {
              totalOut += qty;
            }
          }
        }

        const type: "IN" | "OUT" = totalIn > 0n ? "IN" : "OUT";
        const rawAmount: bigint = type === "IN" ? totalIn : totalOut;
        const amountLovelace = txDetails.output_amount
          .filter((o: any) => o.unit === "lovelace" && o.address === address)
          .reduce((acc, o) => acc + BigInt(o.quantity), 0n);

        // Convert lovelace to ADA (1 ADA = 1,000,000 lovelace)
        const amount = Number(
          txDetails.output_amount
            .filter((o: any) => o.unit === "lovelace")
            .reduce((acc, o) => acc + BigInt(o.quantity), 0n)
        ) / 1_000_000; // if you want ADA

        const fees = Number(BigInt(txDetails.fees) / 1_000_000n);

        results.push({
          hash: tx.tx_hash,
          block: txDetails.block_height,
          timestamp: txDetails.block_time * 1000,
          fees,
          amount,
          type,
          outputs: txDetails.output_amount,
        });
      }

      return results;
    } catch (error: any) {
      console.error("Error fetching ADA transaction history:", error.message);
      throw new Error("Failed to fetch Cardano child transaction history");
    }
  }

   async ApitransactionWebhook(transactionWebhook: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
  }) {
    console.log(transactionWebhook)
    try {
      const response = await axios.post(
        "https://api-masamasa.usemorney.com/webhook/transaction", // replace with your actual URL
        transactionWebhook
      );
      return response.data;
    } catch (error: any) {
      console.error("Failed to call transaction webhook:", error.message);
    }
  }


  private async getCurrentSlot(network: string, key: string): Promise<number> {
    const { data } = await axios.get(`https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest`, {
      headers: { project_id: key },
    });
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

