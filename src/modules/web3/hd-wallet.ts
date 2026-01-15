import { ethers, formatUnits, hexlify } from "ethers";
import { PublicService } from "../global/public/public.service";
import axios from "axios";
// CommonJS require
const bip39 = require("bip39");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
// You must wrap a tiny-secp256k1 compatible implementation
const bip32 = BIP32Factory(ecc);

const DERIVATION_PATH = "m/44'/60'/0'/0";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export class HDWallet {
  private root: any;
  private mnemonic: string;
  private readonly publicService: PublicService;
  private constructor(
    mnemonic: string,
    root: any,
    publicService: PublicService,
  ) {
    this.mnemonic = mnemonic;
    this.root = root;
    this.publicService = publicService;
  }

  /**
   * Create HDWallet instance from mnemonic
   */
  static async fromMnemonic(
    mnemonic: string,
    publicService: PublicService,
  ): Promise<HDWallet> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);

    return new HDWallet(mnemonic, root, publicService);
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
   * Sweep funds from a child wallet to the master wallet
   */
  async sweep(
    child: { wallet: ethers.Wallet },
    masterWallet: ethers.Wallet,
    network: string,
    symbol: string,
  ) {
    const wallet = child.wallet;

    const BUFFER = 1_000_000_000n; // 0.000000001 ETH

    if (!wallet.provider) throw new Error("Child wallet must have a provider");

    // 1. Get balance
    const balance = await wallet.provider.getBalance(wallet.address);
    if (balance === 0n) return null;

    console.log(formatUnits(balance), network);

    // 2. Prepare dummy tx for gas estimation
    const dummyTx = {
      to: masterWallet.address,
      value: 0n,
    };

    // Estimate gas limit (BigInt)
    const gasLimit = BigInt(await wallet.estimateGas(dummyTx));

    // 3. Get fee data & latest block
    const feeData = await wallet.provider.getFeeData();
    const latestBlock = await wallet.provider.getBlock("latest");

    const baseFee = BigInt(latestBlock?.baseFeePerGas ?? 0n);
    const maxPriorityFeePerGas = BigInt(feeData.maxPriorityFeePerGas ?? 0n);

    // 4. Calculate initial gas cost
    const gasCost = gasLimit * (baseFee + maxPriorityFeePerGas);

    // 5. Skip if balance insufficient
    if (balance <= gasCost) return null;

    // 6. Recalculate fees (after potential funding)
    const feeDataFinal = await wallet.provider.getFeeData();
    const baseFeeFinal = BigInt(latestBlock?.baseFeePerGas ?? 0n);
    const maxPriorityFeePerGasFinal = BigInt(
      feeDataFinal.maxPriorityFeePerGas ?? 0n,
    );

    const gasCostFinal = gasLimit * (baseFeeFinal + maxPriorityFeePerGasFinal);

    // 7. Amount left to sweep
    const newGas = gasCostFinal + BUFFER;
    if (balance <= newGas) return null;

    let tx: any;
    // 8. Send transaction
    if (symbol === "ETH") {
      const sendAmount = balance - newGas;

      if (sendAmount <= 0n) return null;

      console.log(formatUnits(sendAmount), formatUnits(gasLimit));

      tx = await wallet.sendTransaction({
        to: masterWallet.address,
        value: sendAmount,
        gasLimit,
        maxPriorityFeePerGas: maxPriorityFeePerGasFinal,
        maxFeePerGas: baseFeeFinal + maxPriorityFeePerGasFinal,
      });

      await tx.wait();
    } else {
      // 1. Estimate gas limit for simple transfer
      const gasLimit = 21000n; // standard BNB transfer

      // 2. Get gas price
      const feeData = await wallet.provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 5_000_000_000n; // fallback 5 gwei

      // 3. Calculate total gas cost
      const BUFFER = 1_000_000n; // optional buffer ~0.000001 BNB
      const gasCost = gasLimit * gasPrice + BUFFER;

      // 4. Calculate max sendable amount
      const sendAmount = balance - gasCost;
      if (sendAmount <= 0n) {
        console.log("Balance too low to cover gas + buffer, skipping sweep.");
        return null;
      }

      console.log("Send amount:", ethers.formatUnits(sendAmount));
      console.log("Gas cost:", ethers.formatUnits(gasCost));

      // 5. Send transaction
      tx = await wallet.sendTransaction({
        to: masterWallet.address,
        value: sendAmount,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
      });

      await tx.wait();
      console.log("Sweep successful");
    }

    // 9. Webhook callback (optional, convert to Number for display only)
    const formattedBalance = Number(ethers.formatUnits(balance, 18));

    if (formattedBalance > 0.00002) {
      await this._transactionWebhook({
        address: wallet.address,
        network,
        token_symbol: symbol,
        amount: formattedBalance,
        hash: tx.hash,
        fee: ethers.formatUnits(newGas, 18),
      });
    }

    return true;
  }

  /** Sweep ERC20 token (USDT, USDC, etc.) from child to master */
  async sweepToken(
    child: { wallet: ethers.Wallet },
    masterWallet: ethers.Wallet,
    tokenAddress: string,
    network: string,
    symbol: string,
  ) {
    const wallet = child.wallet;
    if (!wallet.provider) throw new Error("Child wallet must have a provider");

    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const decimals: number = await token.decimals(); // requires ERC20 ABI including decimals()
    const balance: bigint = await token.balanceOf(wallet.address);
    if (balance === 0n) {
      return null;
    }
    console.log(
      `Child ${wallet.address} has token balance: ${formatUnits(balance, decimals)}`,
    );
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
      const fundTx = await masterWallet.sendTransaction({
        to: wallet.address,
        value: fundAmount,
        gasLimit: Number(gasLimit),
        gasPrice: gasPrice,
      });
      await fundTx.wait();
    }

    const tx = await token.transfer(masterWallet.address, balance, {
      gasLimit: Number(gasLimit),
      gasPrice: gasPrice,
    });
    await tx.wait();

    await this._transactionWebhook({
      address: wallet.address,
      network: network,
      token_symbol: symbol,
      amount: formatUnits(balance, decimals),
      hash: tx.hash,
      fee: ethers.formatUnits(totalGasCost, 18),
    });

    return true;
  }

  async sweepCorrect(
    child: { wallet: ethers.Wallet },
    masterWallet: ethers.Wallet,
    network: string,
    symbol: string,
  ) {
    const wallet = child.wallet;

    const BUFFER = 1000_0000_000n; // 0.00000005 ETH

    if (!wallet.provider) throw new Error("Child wallet must have a provider");

    const balance = await wallet.provider.getBalance(wallet.address);
    if (balance === 0n) return null;

    // 1. Prepare a dummy tx for estimation
    const dummyTx = {
      to: masterWallet.address,
      value: 0n,
    };

    // 2. Estimate gas for this wallet (accurate)
    const gasLimit = await wallet.estimateGas(dummyTx);

    // 3. Get current gas data
    const feeData = await wallet.provider.getFeeData();
    const baseFee = (await wallet.provider.getBlock("latest"))!.baseFeePerGas!;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas!;

    // Actual gas cost = gasLimit * (baseFee + priority fee)
    const gasCost = gasLimit * (baseFee + maxPriorityFeePerGas);

    // 4. If insufficient balance, top-up the child wallet
    if (balance <= gasCost) {
      return null;
    }

    // 5. Recalculate fees after funding (fees may change)
    const latestBlock = await wallet.provider.getBlock("latest");
    const feeDataFinal = await wallet.provider.getFeeData();

    const baseFeeFinal = latestBlock!.baseFeePerGas!;
    const maxPriorityFeePerGasFinal = feeDataFinal.maxPriorityFeePerGas!;

    // final real gas cost
    const gasCostFinal = gasLimit * (baseFeeFinal + maxPriorityFeePerGasFinal);

    // 6. Amount left to sweep
    const newGas = gasCostFinal + BUFFER;

    const sendAmount = balance - newGas;
    if (sendAmount <= 0n) return null;

    const tx = await wallet.sendTransaction({
      to: masterWallet.address,
      value: sendAmount,
      gasLimit,
      maxPriorityFeePerGas: maxPriorityFeePerGasFinal,
      maxFeePerGas: baseFeeFinal + maxPriorityFeePerGasFinal,
    });

    await tx.wait();
  }

  async getETHBalance(masterWallet: ethers.Wallet): Promise<string> {
    if (!masterWallet.provider)
      throw new Error("Master wallet must have a provider");
    console.log(masterWallet.address);
    const balance = await masterWallet.provider.getBalance(
      masterWallet.address,
    );
    return ethers.formatUnits(balance, 18); // returns string in ETH
  }
  async getERC20Balance(
    masterWallet: ethers.Wallet,
    tokenAddress: string,
  ): Promise<string> {
    if (!masterWallet.provider)
      throw new Error("Master wallet must have a provider");

    const token = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      masterWallet.provider,
    );
    const decimals: number = await token.decimals();
    const balance: bigint = await token.balanceOf(masterWallet.address);
    return ethers.formatUnits(balance, decimals); // returns string in token units
  }

  /**
   * Withdraw funds from master wallet to any address
   * Supports both native tokens (ETH/BNB) and ERC20 tokens
   */
  async withdrawFromMaster(
    provider: ethers.JsonRpcProvider,
    toAddress: string,
    amount: string,
    tokenAddress?: string,
    network: string = "BASE",
    symbol: string = "ETH",
  ): Promise<string> {
    const masterWallet = this.getMasterWallet(provider);

    if (!masterWallet.provider)
      throw new Error("Master wallet must have a provider");

    // Withdraw ERC20 Token
    if (tokenAddress) {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, masterWallet);
      const decimals: number = await token.decimals();
      const amountInWei = ethers.parseUnits(amount, decimals);

      // Check balance
      const balance: bigint = await token.balanceOf(masterWallet.address);
      if (balance < amountInWei) {
        throw new Error(
          `Insufficient ${symbol} balance. Available: ${ethers.formatUnits(balance, decimals)}`,
        );
      }

      // Send token transfer
      const tx = await token.transfer(toAddress, amountInWei);
      await tx.wait();

      console.log(
        `Withdrew ${amount} ${symbol} to ${toAddress}. Tx: ${tx.hash}`,
      );
      return tx.hash;
    }

    // Withdraw Native Token (ETH/BNB)
    const amountInWei = ethers.parseEther(amount);
    const balance = await masterWallet.provider.getBalance(
      masterWallet.address,
    );

    if (balance < amountInWei) {
      throw new Error(
        `Insufficient ${symbol} balance. Available: ${ethers.formatEther(balance)}`,
      );
    }

    // Estimate gas
    const feeData = await masterWallet.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 5_000_000_000n;
    const gasLimit = 21000n;
    const gasCost = gasLimit * gasPrice;

    // Ensure enough for gas
    if (balance < amountInWei + gasCost) {
      throw new Error(
        `Insufficient balance to cover amount + gas. Available: ${ethers.formatEther(balance)}`,
      );
    }

    // Send transaction
    const tx = await masterWallet.sendTransaction({
      to: toAddress,
      value: amountInWei,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
    });

    await tx.wait();
    console.log(`Withdrew ${amount} ${symbol} to ${toAddress}. Tx: ${tx.hash}`);
    return tx.hash;
  }

  async getChildTransactionHistory(
    index: number,
    network: string,
    limit: number = 3,
  ): Promise<any[]> {
    const childAddress = this.getChildWallet(index, null as any).address;

    let apiUrl = "";
    if (network.toUpperCase() === "BASE") {
      apiUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${childAddress}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
    } else if (
      network.toUpperCase() === "BINANCE" ||
      network.toUpperCase() === "BSC" ||
      network.toUpperCase() === "BINANCE CHAIN"
    ) {
      apiUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${childAddress}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
    } else if (network.toUpperCase() === "ETHEREUM") {
      apiUrl = `https://api.etherscan.io/api?module=account&action=txlist&address=${childAddress}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
    } else {
      return [];
    }

    try {
      const { data } = await axios.get(apiUrl);
      if (data.status !== "1" || !data.result) return [];

      const history = data.result.map((tx: any) => ({
        txID: tx.hash,
        type: tx.to.toLowerCase() === childAddress.toLowerCase() ? "IN" : "OUT",
        from: tx.from,
        to: tx.to,
        amount: Number(formatUnits(tx.value, 18)),
        token_symbol:
          network.toUpperCase() === "BINANCE" || network.toUpperCase() === "BSC"
            ? "BNB"
            : "ETH",
        network: network.toUpperCase(),
        status: "success",
        timestamp: Number(tx.timeStamp) * 1000,
        date: new Date(Number(tx.timeStamp) * 1000),
      }));

      return history.filter((a: any) => a.type === "IN");
    } catch (err: any) {
      console.error(`Failed to fetch ${network} history:`, err.message);
      return [];
    }
  }

  async getChildTokenTransactionHistory(
    index: number,
    network: string,
    tokenAddress: string,
    limit: number = 3,
  ): Promise<any[]> {
    const childAddress = this.getChildWallet(index, null as any).address;

    let apiUrl = "";
    if (network.toUpperCase() === "BASE") {
      apiUrl = `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${tokenAddress}&address=${childAddress}&startblock=0&endblock=999999999&page=1&offset=${limit}&sort=desc`;
    } else if (
      network.toUpperCase() === "BINANCE" ||
      network.toUpperCase() === "BSC" ||
      network.toUpperCase() === "BINANCE CHAIN"
    ) {
      apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${tokenAddress}&address=${childAddress}&startblock=0&endblock=999999999&page=1&offset=${limit}&sort=desc`;
    } else if (network.toUpperCase() === "ETHEREUM") {
      apiUrl = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${tokenAddress}&address=${childAddress}&startblock=0&endblock=999999999&page=1&offset=${limit}&sort=desc`;
    } else {
      return [];
    }

    try {
      const { data } = await axios.get(apiUrl);
      if (data.status !== "1" || !data.result) return [];

      const history = data.result.map((tx: any) => ({
        txID: tx.hash,
        type: tx.to.toLowerCase() === childAddress.toLowerCase() ? "IN" : "OUT",
        from: tx.from,
        to: tx.to,
        amount: Number(formatUnits(tx.value, Number(tx.tokenDecimal))),
        token_symbol: tx.tokenSymbol,
        network: network.toUpperCase(),
        status: "success",
        timestamp: Number(tx.timeStamp) * 1000,
        date: new Date(Number(tx.timeStamp) * 1000),
      }));

      return history.filter((a: any) => a.type === "IN");
    } catch (err: any) {
      console.error(`Failed to fetch ${network} token history:`, err.message);
      return [];
    }
  }

  private async _transactionWebhook(transactionWebhook: {
    network: string;
    address: string;
    amount: number | string;
    token_symbol: string;
    hash?: string;
    fee?: any;
  }) {
    try {
      return await this.publicService.transactionWebhook({
        ...transactionWebhook,
        amount: Number(transactionWebhook.amount),
      });
    } catch (error: any) {
      console.error("Failed to call transaction webhook:", error.message);
      throw new Error("Transaction webhook failed");
    }
  }
}
