import { Bip32PrivateKey, BaseAddress, NetworkInfo, Address, Credential } from "@emurgo/cardano-serialization-lib-nodejs";
import * as bip39 from "bip39";

export class CardanoHDWallet {
  private root!: Bip32PrivateKey;

  constructor(mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid Cardano mnemonic");
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    this.root = Bip32PrivateKey.from_bip39_entropy(seed, Buffer.from(""));
  }

  /**
   * CIP-1852 derivation:
   * m / 1852' / 1815' / account' / role / index
   */
  deriveKeypair(index: number) {
    const account = this.root
      .derive(1852 | 0x80000000)
      .derive(1815 | 0x80000000)
      .derive(0 | 0x80000000);

    const paymentPrv = account.derive(0).derive(index);
    const paymentPub = paymentPrv.to_public();

    const stakePrv = account.derive(2).derive(0);
    const stakePub = stakePrv.to_public();

    return {
      paymentPrv,
      paymentPub,
      stakePrv,
      stakePub,
    };
  }

  /**
   * Generate full Shelley Base Address
   */
  generateAddress(index: number, isMainnet = true): string {
    const { paymentPub, stakePub } = this.deriveKeypair(index);

    const addr = BaseAddress.new(
      isMainnet
        ? NetworkInfo.mainnet().network_id()
        : NetworkInfo.testnet_preprod().network_id(),
      Credential.from_keyhash(paymentPub.to_raw_key().hash()),
      Credential.from_keyhash(stakePub.to_raw_key().hash())
    );

    return addr.to_address().to_bech32();
  }
}
