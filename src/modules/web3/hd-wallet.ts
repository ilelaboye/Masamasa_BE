import { ethers, formatUnits, hexlify } from "ethers";
import { PublicService } from "../global/public/public.service";
// CommonJS require
const bip39 = require("bip39");
const ecc = require('tiny-secp256k1')
const { BIP32Factory } = require('bip32')
// You must wrap a tiny-secp256k1 compatible implementation
const bip32 = BIP32Factory(ecc)

const DERIVATION_PATH = "m/44'/60'/0'/0";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

export class HDWallet {
  private root: any;
  private mnemonic: string;
  private readonly publicService: PublicService;
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
  async sweep(child: { wallet: ethers.Wallet }, masterWallet: ethers.Wallet, network: string, symbol: string) {
    const wallet = child.wallet;

    if (!wallet.provider) throw new Error("Child wallet must have a provider");

    let balance = await wallet.provider.getBalance(wallet.address);
    if (balance === 0n) return null;

     // Fee data
    const feeData = await wallet.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    const gasLimit = 21000n;
    const totalGasCost = gasPrice * gasLimit;

    if (balance <= totalGasCost) {
      const fundAmount = totalGasCost - balance + 10000000000000n; // 0.00001 ETH buffer
      const fundTx = await masterWallet.sendTransaction({
        to: wallet.address,
        value: fundAmount,
        gasLimit: Number(gasLimit),
        gasPrice: gasPrice,
      });
      await fundTx.wait();

      balance = await wallet.provider.getBalance(wallet.address);
    }

    const amountToSend = balance - totalGasCost;
    if (amountToSend <= 0n) return null;

    const tx = await wallet.sendTransaction({
      to: masterWallet.address,
      value: amountToSend,
      gasLimit: Number(gasLimit),
      gasPrice: gasPrice,
    });
    await tx.wait();
    await this.publicService.transactionWebhook({ address: wallet.address, network: network, token_symbol: symbol, amount: Number(formatUnits(balance)) });
    return true;
  }

  /** Sweep ERC20 token (USDT, USDC, etc.) from child to master */
  async sweepToken(child: { wallet: ethers.Wallet }, masterWallet: ethers.Wallet, tokenAddress: string, network: string, symbol: string) {
    const wallet = child.wallet;
    console.log(`${masterWallet.address}`);
    if (!wallet.provider) throw new Error("Child wallet must have a provider");

    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const balance: bigint = await token.balanceOf(wallet.address);
    if (balance === 0n) {
      return null;
    }
    console.log(`Child ${wallet.address} has token balance: ${formatUnits(balance)}`);
    // Gas check
    const feeData = await wallet.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    const gasLimit = 60000n; // ERC-20 transfer gas estimate
    const totalGasCost = gasPrice * gasLimit;
    const nativeBalance = await wallet.provider.getBalance(wallet.address);

    if (nativeBalance < totalGasCost) {
      console.log(`Child ${wallet.address} needs funding for gas`);
      // Fund from master if needed
      const fundAmount = totalGasCost - nativeBalance + 10000000000000n;
      console.log(`Funding child ${wallet.address} with ${formatUnits(fundAmount)} ${formatUnits(totalGasCost)} ETH for gas`);
      const fundTx = await masterWallet.sendTransaction({
        to: wallet.address,
        value: fundAmount,
        gasLimit: Number(gasLimit),
        gasPrice: gasPrice,
      });
      await fundTx.wait();
    }

    // Transfer token
    console.log(`Transferring tokens from ${wallet.address} to ${masterWallet.address}`);
    const tx = await token.transfer(masterWallet.address, balance, {
      gasLimit: Number(gasLimit),
      gasPrice: gasPrice,
    });
    await tx.wait();
    await this.publicService.transactionWebhook({ address: wallet.address, network: network, token_symbol: symbol, amount: Number(formatUnits(balance)) });
    console.log(`Swept ${balance} tokens from ${wallet.address} to ${masterWallet.address}`);
    return true;
  }
}
