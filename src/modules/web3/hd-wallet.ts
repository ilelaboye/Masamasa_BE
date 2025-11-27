import { ethers, hexlify } from "ethers";
import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";

const DERIVATION_PATH = "m/44'/60'/0'/0";

export class HDWallet {
  private root: HDKey;

  constructor(private mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    this.root = HDKey.fromMasterSeed(seed);
  }

  // MASTER WALLET (index 0)
  getMasterWallet(provider: ethers.JsonRpcProvider) {
    const child = this.root.derive(`${DERIVATION_PATH}/0`);
    if (!child.privateKey) throw new Error("No private key derived");

    const privateKey = hexlify(child.privateKey);
    return new ethers.Wallet(privateKey, provider);
  }

  // CHILD DEPOSIT WALLET
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

  // SWEEP CHILD → MASTER
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
