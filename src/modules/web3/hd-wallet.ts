import { ethers, hexlify } from "ethers";
import * as bip39 from "bip39";

const DERIVATION_PATH = "m/44'/60'/0'/0";

let HDKey: any;

/**
 * Dynamically import @scure/bip32 (ESM only)
 */
async function loadHDKey() {
  if (!HDKey) {
    const bip32 = await import("@scure/bip32");
    HDKey = bip32.HDKey;
  }
  return HDKey;
}

export class HDWallet {
  private root: any;

  private constructor(private mnemonic: string, root: any) {
    this.root = root;
  }

  /**
   * Factory method to create HDWallet instance
   */
  static async fromMnemonic(mnemonic: string): Promise<HDWallet> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const HDKeyModule = await loadHDKey();
    const root = HDKeyModule.fromMasterSeed(seed);

    return new HDWallet(mnemonic, root);
  }

  /**
   * Master wallet (index 0)
   */
  getMasterWallet(provider: ethers.JsonRpcProvider) {
    const child = this.root.derive(`${DERIVATION_PATH}/0`);
    if (!child.privateKey) throw new Error("No private key derived");

    const privateKey = hexlify(child.privateKey);
    return new ethers.Wallet(privateKey, provider);
  }

  /**
   * Child wallet at a specific index
   */
  getChildWallet(index: number, provider: ethers.JsonRpcProvider) {
    const child = this.root.derive(`${DERIVATION_PATH}/${index}`);
    if (!child.privateKey) throw new Error("No private key derived");

    const privateKey = hexlify(child.privateKey);
    const wallet = new ethers.Wallet(privateKey, provider);

    return {
      index,
      address: wallet.address,
      privateKey,
      wallet,
    };
  }

  /**
   * Sweep funds from a child wallet to master address
   */
  async sweep(child: any, masterAddress: string) {
    const balance = await child.wallet.getBalance();

    if (balance.eq(0)) {
      return { success: false, message: "Zero balance" };
    }

    const gasPrice = await child.wallet.provider.getGasPrice();
    const gasLimit = 21000;
    const gasCost = gasPrice.mul(gasLimit);

    const value = balance.sub(gasCost);
    if (value.lte(0)) {
      return { success: false, message: "Not enough for gas" };
    }

    const tx = await child.wallet.sendTransaction({
      to: masterAddress,
      value,
      gasLimit,
      gasPrice,
    });

    await tx.wait();

    return { success: true, txHash: tx.hash };
  }
}
