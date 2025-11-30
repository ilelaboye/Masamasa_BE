import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawEthDto, WithdrawTokenDto } from "./web3.dto";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import FormData from "form-data";
import { InjectRepository } from "@nestjs/typeorm";
import { Wallet } from "../wallet/wallet.entity";
import { Repository } from "typeorm";
import { HDWallet } from "./hd-wallet";
import { TronHDWallet } from "./tron-hd-wallet";
import { SolHDWallet } from "./sol-hd-wallet";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { Bip32PrivateKey } from "@emurgo/cardano-serialization-lib-nodejs";
import { CardanoHDWallet } from "./ada-hd-wallet";

const TronWeb = require("tronweb");

const walletManagerAbi = [
  "function getWalletByUserId(string userId) view returns (address)",
  "function createWallet(string userId) returns (address)",
  "function getAllBalances() view returns (tuple(string symbol, uint256 balance)[])",
  "function network() view returns (string)",
  "function getAllTransactions() view returns (tuple(string network, address wallet, uint256 amount, string tokenSymbol, address tokenAddress, uint256 timestamp)[])",
  "function getTokenBalance(address tokenAddress) view returns (uint256)",
  "function withdrawContractETH(uint256 amount, address payable to)",
  "function withdrawContractToken(address tokenAddress, uint256 amount, address to)"
];

@Injectable()
export class Web3Service {
  private hd!: HDWallet;
  private provider: ethers.JsonRpcProvider;
  private providerBase: ethers.JsonRpcProvider;
  private conn: Connection;
  private hdSol: SolHDWallet;
  private hdTRX: TronHDWallet;
  private tronWeb: any;
  private hdADA: CardanoHDWallet;
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>
  ) {
    this.provider = new ethers.JsonRpcProvider(appConfig.EVM_RPC_URL);
    this.providerBase = new ethers.JsonRpcProvider(appConfig.BASE_RPC_URL);
    if (!appConfig.MASTER_MNEMONIC) {
      throw new Error("MASTER_MNEMONIC is missing in .env");
    }

    this.conn = new Connection(appConfig.SOL_RPC_URL, "confirmed");
    this.hdSol = new SolHDWallet(appConfig.SOL_MASTER_MNEMONIC);
    this.hdTRX = new TronHDWallet(appConfig.TRX_MASTER_MNEMONIC);
    this.tronWeb = this.hdTRX.getTronWebInstance();
    this.hdADA = new CardanoHDWallet(appConfig.ADA_MASTER_MNEMONIC);
  }

  // -----------------------------
  // INIT HDWallet (async)
  // -----------------------------
  private async initHDWallet() {
    if (!this.hd) {
      this.hd = await HDWallet.fromMnemonic(appConfig.MASTER_MNEMONIC);
    }
  }

  // -----------------------------
  // HELPER: signer
  // -----------------------------
  private getSigner(): ethers.Wallet {
    return new ethers.Wallet(appConfig.MASTER_MNEMONIC, this.provider);
  }

  // -----------------------------
  // HELPER: contract
  // -----------------------------
  private getContract(address?: string, signerOrProvider?: ethers.Signer | ethers.Provider) {
    return new ethers.Contract(address ?? "", walletManagerAbi, signerOrProvider);
  }

  // -----------------------------
  // CREATE HD WALLET FOR USER
  // -----------------------------
  async createWallet(req, payload: any) {
    await this.initHDWallet(); // ensure hd wallet is ready

    try {
      const userId = payload.id.toString();

      const childWallet = this.hd.getChildWallet(userId, this.provider);
      const solChildWallet = this.hdSol.deriveKeypair(userId).publicKey.toBase58();
      const tronChildWallet = this.hdTRX.getChildAddress(userId);

      const existWalletETH = await this.walletRepository.findOne({ where: { wallet_address: childWallet.address } });
      const existWalletSOL = await this.walletRepository.findOne({ where: { wallet_address: solChildWallet } });
      const existWalletTRX = await this.walletRepository.findOne({ where: { wallet_address: tronChildWallet } });
      const cardanoChild = this.hdADA.generateAddress(userId, true);
      const existWalletADA = await this.walletRepository.findOne({
        where: { wallet_address: cardanoChild }
      });

      if (!existWalletADA) {
        const ada = this.walletRepository.create({
          user: req.user,
          network: "CARDANO",
          currency: "ADA",
          wallet_address: cardanoChild
        });
        await this.walletRepository.save(ada);
      }

      if (!existWalletETH) {
        const base = this.walletRepository.create({
          user: req.user,
          network: "Base",
          currency: "ETH",
          wallet_address: childWallet.address,
        });
        await this.walletRepository.save(base);
      }

      if (!existWalletSOL) {
        const sol = this.walletRepository.create({
          user: req.user,
          network: "SOLANA",
          currency: "SOL",
          wallet_address: solChildWallet
        });
        await this.walletRepository.save(sol);
      }

      if (!existWalletTRX) {
        const trx = this.walletRepository.create({
          user: req.user,
          network: "TRON",
          currency: "TRX",
          wallet_address: tronChildWallet
        });
        await this.walletRepository.save(trx);
      }

      return {
        eth: childWallet.address,
        sol: solChildWallet,
        trx: tronChildWallet,
        ada: cardanoChild
      };
    } catch (err: any) {
      console.error(err);
      throw new BadRequestException("Wallet creation failed");
    }
  }

  //----------------------------
  //SWEEP
  // -----------------------------

  // -----------------------------
  // SWEEP ALL CHILD WALLETS
  // -----------------------------
  async sweepWallets(req) {
    await this.initHDWallet();
    const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
    const masterWallet = this.hd.getMasterWallet(this.provider);
    // Fetch the user's wallet
    const w = await this.walletRepository.findOne({ where: { user: req.user.id } });
    if (!w) return false;

    try {
      const ERC20_TOKENS: Record<string, string> = {
        BASE_USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base USDT
        BASE_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // BASE USDC
        BASE_BTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // BASE BTC
        BNB_USDT: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
        BNB_USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC USDT
        BNB_RIPPLE: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // BSC XRP
        BNB_DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // BSC DOGE
        BNB_BTC: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BSC BTC
        SOL_USDT: "Es9vMFrzaCERn8X3jPbU9Uq5o1T2yD8KK3FWrHQXgk2",
        SOL_USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        TRON_USDT: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"
        // Add Base USDT/USDC addresses here if needed
      };

      // -----------------------------
      // BASE and BSC
      // -----------------------------
      if (w) {
        const childWallet = this.hd.getChildWallet(Number(req.user.id), this.providerBase);
        const childWallet2 = this.hd.getChildWallet(Number(req.user.id), this.provider);
        await this.hd.sweep(childWallet, masterWalletBase, "BASE", "ETH");
        await this.hd.sweep(childWallet2, masterWallet, "BINANCE CHAIN", "BNB");
        console.log(`Swept from ${masterWallet.address}`);
        // //BASE ERC20 tokens
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_USDT"], "BASE", "USDT");
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_USDC"], "BASE", "USDC");
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_BTC"], "BASE", "BTC");
        //bsc erc20 tokens
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_USDT"], "BINANCE CHAIN", "USDT");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_USDC"], "BINANCE CHAIN", "USDC");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_RIPPLE"], "BINANCE CHAIN", "XRP");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_DOGE"], "BINANCE CHAIN", "DOGE");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_BTC"], "BINANCE CHAIN", "BTC");
      }
    } catch (err: any) {
      console.error(`Failed to for user ${req.user.id}:`, err.message);
      return false;
    }

    console.log("Sweep completed for user", req.user.id);
    return true;
  }

  // -----------------------------
  // WITHDRAW ETH
  // -----------------------------
  async withdrawETH(req, payload: WithdrawEthDto) {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract("", signer);

      const tx = await walletManager.withdrawContractETH(payload.amount, payload.to);
      await tx.wait();

      return tx.hash;
    } catch (err: any) {
      throw new BadRequestException(err.message || "Insufficient funds for withdrawal");
    }
  }

  // -----------------------------
  // WITHDRAW TOKEN
  // -----------------------------
  async withdrawToken(payload: WithdrawTokenDto) {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract("appConfig", signer);

      const tx = await walletManager.withdrawContractToken(payload.tokenAddress, payload.amount, payload.to);
      await tx.wait();

      return tx.hash;
    } catch (err: any) {
      throw new BadRequestException(err.message || "Insufficient funds for withdrawal");
    }
  }

  // -----------------------------
  // GET TOKEN BALANCES
  // -----------------------------
  private async getTokenBalanceETH(tokenAddress: string, decimals = 18): Promise<number> {
    await this.initHDWallet();
    const masterAddress = this.hd.getMasterWallet(this.provider).address;
    if (!tokenAddress) return 0;

    const contract = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)"],
      this.provider
    );

    const balance = await contract.balanceOf(masterAddress);
    return Number(formatUnits(balance, decimals));
  }

  private async getTokenBalanceTRX(tokenAddress: string): Promise<number> {
    if (!tokenAddress) return 0;
    const master = this.hdTRX.getMasterWallet().address;
    const contract = await this.tronWeb.contract().at(tokenAddress);
    const balance = await contract.balanceOf(master).call();
    return Number(balance) / 1e6;
  }

  private async getTokenBalanceSOL(tokenMint: PublicKey, owner: PublicKey): Promise<number> {
    try {
      const tokenAddr = await getAssociatedTokenAddress(tokenMint, owner);
      const tokenAcc = await getAccount(this.conn, tokenAddr);
      return Number(tokenAcc.amount) / 1e6;
    } catch {
      return 0;
    }
  }

  // -----------------------------
  // GET ALL BALANCES
  // -----------------------------
  async getAllBalances() {
    await this.initHDWallet();

    try {
      const masterETH = this.hd.getMasterWallet(this.provider).address;
      const ethBalance = Number(formatUnits(await this.provider.getBalance(masterETH), 18));
      const usdtBalance = await this.getTokenBalanceETH("0xdAC17F958D2ee523a2206206994597C13D831ec7", 6);
      const bnbBalance = await this.getTokenBalanceETH("0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18);

      const masterTRX = this.hdTRX.getMasterWallet().address;
      const trxBalance = (await this.tronWeb.trx.getBalance(masterTRX)) / 1e6;
      const trxUSDTBalance = await this.getTokenBalanceTRX("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj");

      const masterSOL = this.hdSol.getMasterKeypair().publicKey;
      const solBalance = (await this.conn.getBalance(masterSOL)) / LAMPORTS_PER_SOL;
      const solUSDCBalance = await this.getTokenBalanceSOL(
        new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        masterSOL
      );
      const solUSDTBalance = await this.getTokenBalanceSOL(
        new PublicKey("Es9vMFrzaCERn8X3jPbU9Uq5o1T2yD8KK3FWrHQXgk2"),
        masterSOL
      );

      return {
        ETH: ethBalance,
        BNB: bnbBalance,
        USDT: usdtBalance,
        TRX: trxBalance,
        TRX_USDT: trxUSDTBalance,
        SOL: solBalance,
        SOL_USDC: solUSDCBalance,
        SOL_USDT: solUSDTBalance
      };
    } catch (err: any) {
      throw new BadRequestException(err.message || "Failed to fetch balances");
    }
  }

  // -----------------------------
  // GET RECENT TRANSACTIONS
  // -----------------------------
  async getRecentTransactions() {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract("appConfig", signer);

      const raw = await walletManager.getAllTransactions();
      return raw.map((tx: any) => ({
        network: tx.network,
        wallet: tx.wallet,
        amount: (Number(tx.amount) / 1e18).toString(),
        tokenSymbol: tx.tokenSymbol,
        tokenAddress: tx.tokenAddress,
        timestamp: tx.timestamp.toString()
      }));
    } catch (err: any) {
      throw new BadRequestException(err.message || "Get recent transactions failed");
    }
  }

  // -----------------------------
  // UPLOAD IMAGE
  // -----------------------------
  async uploadImage(file: Express.Multer.File) {
    try {
      if (!file) throw new BadRequestException("Image file not provided");

      const form = new FormData();
      form.append("file", file.buffer, { filename: file.originalname });
      form.append("upload_preset", appConfig.CLOUDINARY_UPLOAD_PRESET);

      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${appConfig.CLOUDINARY_CLOUD_NAME}/image/upload`,
        form,
        { headers: form.getHeaders() }
      );

      return { success: true, imageUrl: response.data.secure_url };
    } catch (err: any) {
      throw new BadRequestException(err.response?.data || err.message || "Image upload failed");
    }
  }
}
