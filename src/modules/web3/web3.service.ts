import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawEthDto, WithdrawTokenDto } from "./web3.dto";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from "@solana/web3.js";
import FormData from "form-data";
import { InjectRepository } from "@nestjs/typeorm";
import { Wallet } from "../wallet/wallet.entity";
import { Repository } from "typeorm";
import { HDWallet } from "./hd-wallet";
import { TronHDWallet } from "./tron-hd-wallet";
import { SolHDWallet } from "./sol-hd-wallet";
const TronWeb = require("tronweb");
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

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
  private hd: HDWallet;
  private provider: ethers.JsonRpcProvider;
  private conn: Connection;
  private hdSol: SolHDWallet;
  private hdTRX: TronHDWallet;
  private tronWeb: any;
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>
  ) {
    // -----------------------------
    // INIT PROVIDER + HD WALLET
    // -----------------------------
    this.provider = new ethers.JsonRpcProvider(appConfig.ETH_RPC_URL);

    if (!appConfig.MASTER_MNEMONIC) {
      throw new Error("MASTER_MNEMONIC is missing in .env");
    }

    this.hd = new HDWallet(appConfig.MASTER_MNEMONIC);
    this.conn = new Connection(appConfig.SOL_RPC_URL, "confirmed");
    this.hdSol = new SolHDWallet(appConfig.SOL_MASTER_MNEMONIC);
    this.hdTRX = new TronHDWallet(appConfig.TRX_MASTER_MNEMONIC);
    this.tronWeb = this.hdTRX.getTronWebInstance()
  }

  // -----------------------------
  // HELPER: signer
  // -----------------------------
  private getSigner(): ethers.Wallet {
    return new ethers.Wallet(appConfig.ETH_PRIVATE_KEY, this.provider);
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
    try {
      const userId = payload.id.toString();

      // Each user gets a derived child wallet
      const childWallet = this.hd.getChildWallet(userId, this.provider);
      const solChildWallet = this.hdSol.deriveKeypair(userId).publicKey.toBase58();
      const tronChildWallet = this.hdTRX.getChildAddress(userId);

      const existWallet = await this.walletRepository.findOne({
        where: { wallet_address: childWallet.address },
      });
      const existWalletSOL = await this.walletRepository.findOne({
        where: { wallet_address: solChildWallet },
      });

      const existWalletTRX = await this.walletRepository.findOne({
        where: { wallet_address: tronChildWallet },
      });

      // Save to DB
      if (!existWallet) {
        const base = this.walletRepository.create({
          user: req.user,
          network: "Base",
          currency: "ETH",
          wallet_address: childWallet.address,
        });
        await this.walletRepository.save(base);
      }

      if (!existWalletSOL) {
        const SOL = this.walletRepository.create({
          user: req.user,
          network: "SOLANA",
          currency: "SOL",
          wallet_address: solChildWallet
        });
        await this.walletRepository.save(SOL);
      }

      if (!existWalletTRX) {
        const TRX = this.walletRepository.create({
          user: req.user,
          network: "TRON",
          currency: "TRX",
          wallet_address: tronChildWallet
        });
        await this.walletRepository.save(TRX);
      }

      return {
        eth: childWallet.address,
        sol: solChildWallet,
        trx: tronChildWallet

      };
    } catch (err: any) {
      console.error(err);
      throw new BadRequestException("Wallet creation failed");
    }
  }

  // -----------------------------
  // WITHDRAW ETH
  // -----------------------------
  async withdrawETH(req, payload: WithdrawEthDto) {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

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
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

      const tx = await walletManager.withdrawContractToken(payload.tokenAddress, payload.amount, payload.to);
      await tx.wait();

      return tx.hash;
    } catch (err: any) {
      throw new BadRequestException(err.message || "Insufficient funds for withdrawal");
    }
  }

  // -----------------------------
  // GET BALANCES
  // -----------------------------
  // ERC20 / BEP20 Token balances
  private async getTokenBalanceETH(tokenAddress: string, decimals = 18): Promise<number> {
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

  // TRC20 token balance
  private async getTokenBalanceTRX(tokenAddress: string): Promise<number> {
    if (!tokenAddress) return 0;
    const master = this.hdTRX.getMasterWallet().address;
    const contract = await this.tronWeb.contract().at(tokenAddress);
    const balance = await contract.balanceOf(master).call();
    return Number(balance) / 1e6; // TRC20 usually 6 decimals
  }

  // SPL token balance
  private async getTokenBalanceSOL(tokenMint: PublicKey, owner: PublicKey): Promise<number> {
    try {
      const tokenAddr = await getAssociatedTokenAddress(tokenMint, owner);
      const tokenAcc = await getAccount(this.conn, tokenAddr);
      return Number(tokenAcc.amount) / 1e6; // USDC/USDT usually 6 decimals
    } catch (err) {
      // If the account doesn't exist yet, treat balance as 0
      return 0;
    }
  }

  // Main function to get all balances
  async getAllBalances() {
    try {
      // --- ETH-like / Base ---
      // --- ETH/Base ---
      const masterETH = this.hd.getMasterWallet(this.provider).address;
      const ethBalance = Number(formatUnits(await this.provider.getBalance(masterETH), 18));
      const usdtBalance = await this.getTokenBalanceETH("0xdAC17F958D2ee523a2206206994597C13D831ec7", 6);
      const bnbBalance = await this.getTokenBalanceETH("0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18);
      // --- TRON ---
      const masterTRX = this.hdTRX.getMasterWallet().address;
      const trxBalance = (await this.tronWeb.trx.getBalance(masterTRX)) / 1e6;
      const trxUSDTBalance = await this.getTokenBalanceTRX("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj");

      // --- Solana ---
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
        // USDC: usdcBalance,
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
  // GET TRANSACTIONS
  // -----------------------------
  async getRecentTransactions() {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

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
