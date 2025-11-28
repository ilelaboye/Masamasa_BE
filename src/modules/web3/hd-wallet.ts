import { ethers, hexlify } from "ethers";
// CommonJS require
const bip39 = require("bip39");
const ecc = require('tiny-secp256k1')
const { BIP32Factory } = require('bip32')
// You must wrap a tiny-secp256k1 compatible implementation
const bip32 = BIP32Factory(ecc)

const DERIVATION_PATH = "m/44'/60'/0'/0";

export class HDWallet {
  private root: any;
  private mnemonic: string;

  private constructor(mnemonic: string, root: any) {
    this.mnemonic = mnemonic;
    this.root = root;
  }

  /**
   * Create HDWallet instance from mnemonic
   */
  static async fromMnemonic(mnemonic: string): Promise<HDWallet> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);

    return new HDWallet(mnemonic, root);
  }

  /**
   * Get master wallet (index 0)
   */
  getMasterWallet(provider: ethers.JsonRpcProvider) {
    const child = this.root.derivePath(`${DERIVATION_PATH}/0`);
    if (!child.privateKey) throw new Error("No private key derived");

    const privateKey = hexlify(child.privateKey);
    return new ethers.Wallet(privateKey, provider);
  }

  /**
   * Get a child wallet at a specific index
   */
  getChildWallet(index: number, provider: ethers.JsonRpcProvider) {
    const child = this.root.derivePath(`${DERIVATION_PATH}/${index}`);
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
  async sweep(child: { wallet: ethers.Wallet }, masterAddress: string) {

  }
  }
