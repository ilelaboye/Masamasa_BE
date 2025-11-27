// src/wallet/sol-hd-wallet.ts
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import { Keypair, PublicKey } from "@solana/web3.js";

const SOL_DERIVATION_PATH_PREFIX = "m/44'/501'"; // we'll use m/44'/501'/account'/change/index'

export class SolHDWallet {
  private seed: Buffer;

  constructor(private mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
  }

  /**
   * Derive Keypair for given index
   * We'll use path: m/44'/501'/0'/0/index
   */
  deriveKeypair(index: number, account = 0, change = 0): Keypair {
    const path = `${SOL_DERIVATION_PATH_PREFIX}/${account}'/${change}'/${index}'`;
    // ed25519-hd-key derivePath returns { key, chainCode }
    const derived = derivePath(path, this.seed.toString("hex"));
    // derived.key is Buffer (32 bytes)
    const key = derived.key;
    // Keypair.fromSeed expects 32-byte seed
    return Keypair.fromSeed(key);
  }

  getMasterKeypair(): Keypair {
    return this.deriveKeypair(0, 0, 0);
  }

  getAddressFromKeypair(kp: Keypair): string {
    return kp.publicKey.toBase58();
  }
}
