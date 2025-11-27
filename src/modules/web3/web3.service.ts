import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawEthDto, WithdrawTokenDto } from "./web3.dto";
import FormData from "form-data"; //
import { InjectRepository } from "@nestjs/typeorm";
import { Wallet } from "../wallet/wallet.entity";
import { Repository } from "typeorm";

// ABI for WalletManagerRemix (relevant functions)
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

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>
  ) { }
  //--------------------------------------
  // HELPER: get signer
  //--------------------------------------
  private getSigner(): ethers.Wallet {
    const provider = new ethers.JsonRpcProvider(appConfig.ETH_RPC_URL);
    return new ethers.Wallet(appConfig.ETH_PRIVATE_KEY, provider);
  }

  //--------------------------------------
  // HELPER: get contract instance
  //--------------------------------------
  private getContract(address?: string, signerOrProvider?: ethers.Signer | ethers.Provider) {
    return new ethers.Contract(address ?? "", walletManagerAbi, signerOrProvider);
  }

  //--------------------------------------
  // CREATE WALLET
  //--------------------------------------
  async createWallet(req, payload: any) {
    try {
      console.log("Creating wallet for user ID:", payload, req.user);
      //base
      const provider = new ethers.JsonRpcProvider(appConfig.BASE_RPC_URL);
      const signer = new ethers.Wallet(appConfig.BASE_PRIVATE_KEY, provider);
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

      //solana
      const providerSol = new ethers.JsonRpcProvider(appConfig.SOL_RPC_URL);
      const signerSol = new ethers.Wallet(appConfig.SOL_PRIVATE_KEY, provider);
      const walletManagerSol = this.getContract(appConfig.SOL_WALLET_MANAGER_ADDRESS, signer);
      // binance
      const providerBNB = new ethers.JsonRpcProvider(appConfig.BEP20_RPC_URL);
      const signerBNB = new ethers.Wallet(appConfig.BEP20_PRIVATE_KEY, provider);
      const walletManagerBNB = this.getContract(appConfig.BEP20_WALLET_MANAGER_ADDRESS, signer);

      //TRX
      const providerTRX = new ethers.JsonRpcProvider(appConfig.TRON_RPC_URL);
      const signerTRX = new ethers.Wallet(appConfig.TRON_PRIVATE_KEY, provider);
      const walletManagerTRX = this.getContract(appConfig.TRON_WALLET_MANAGER_ADDRESS, signer);


      let walletAddress: string;
      let walletAddressSol: string;
      let walletAddressBNB: string;
      let walletAddressTRX: string;
      try {
        walletAddress = await walletManager.getWalletByUserId(payload.id);
        walletAddressSol = await walletManagerSol.getWalletByUserId(payload.id)
        walletAddressBNB = await walletManagerBNB.getWalletByUserId(payload.id)
        walletAddressTRX = await walletManagerTRX.getWalletByUserId(payload.id)
      } catch {
        walletAddress = ethers.ZeroAddress;
        walletAddressSol = ethers.ZeroAddress;
        walletAddressBNB = ethers.ZeroAddress;
        walletAddressTRX = ethers.ZeroAddress;
      }

      if (!walletAddress || walletAddress === ethers.ZeroAddress) {
        const tx = await walletManager.createWallet(payload.id);
        const receipt = await tx.wait();

        // optional: get wallet address from event
        const event = receipt.events?.find((e: any) => e.event === "WalletCreated");
        walletAddress = await walletManager.getWalletByUserId(payload.id);
        const wallet = this.walletRepository.create({
          user: req.user,
          network: "Base Testnet",
          currency: "ETHT",
          wallet_address: walletAddress,
        });

        await this.walletRepository.save(wallet);
      }

      if (!walletAddressSol || walletAddressSol === ethers.ZeroAddress) {
        const tx = await walletManagerSol.createWallet(payload.id);
        const receipt = await tx.wait();

        // optional: get wallet address from event
        const event = receipt.events?.find((e: any) => e.event === "WalletCreated");
        walletAddressSol = await walletManagerSol.getWalletByUserId(payload.id);
        const wallet = this.walletRepository.create({
          user: req.user,
          network: "SOL Testnet",
          currency: "SOLT",
          wallet_address: walletAddressSol,
        });

        await this.walletRepository.save(wallet);
      }

      if (!walletAddressBNB || walletAddressBNB === ethers.ZeroAddress) {
        const tx = await walletManagerBNB.createWallet(payload.id);
        const receipt = await tx.wait();

        // optional: get wallet address from event
        const event = receipt.events?.find((e: any) => e.event === "WalletCreated");
        walletAddressBNB = await walletManagerBNB.getWalletByUserId(payload.id);
        const wallet = this.walletRepository.create({
          user: req.user,
          network: "BEP20 Testnet",
          currency: "BNBT",
          wallet_address: walletAddressBNB,
        });

        await this.walletRepository.save(wallet);
      }

      if (!walletAddressTRX || walletAddressTRX === ethers.ZeroAddress) {
        const tx = await walletManagerTRX.createWallet(payload.id);
        const receipt = await tx.wait();

        // optional: get wallet address from event
        const event = receipt.events?.find((e: any) => e.event === "WalletCreated");
        walletAddressTRX = await walletManagerTRX.getWalletByUserId(payload.id);
        const wallet = this.walletRepository.create({
          user: req.user,
          network: "Tron Testnet",
          currency: "TRXT",
          wallet_address: walletAddressTRX,
        });

        await this.walletRepository.save(wallet);
      }


      return {
        walletAddress,
        walletAddressSol,
        walletAddressBNB,
        walletAddressTRX
      };
    } catch (err: any) {
      return err;
    }
  }

  //--------------------------------------
  // WITHDRAW ETH
  //--------------------------------------
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

  //--------------------------------------
  // WITHDRAW TOKEN
  //--------------------------------------
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

  //--------------------------------------
  // GET ALL BALANCES
  //--------------------------------------
  async getAllBalances() {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

      const balances = await walletManager.getAllBalances();
      const serializedBalances = balances.map((b: any) => ({
        symbol: b.symbol,
        balance: formatUnits(b.balance, b.decimals ?? 18)
      }));

      return serializedBalances;
    } catch (err: any) {
      throw new BadRequestException(err.message || "Get all balances failed:");
    }
  }

  //--------------------------------------
  // GET RECENT TRANSACTIONS
  //--------------------------------------
  async getRecentTransactions() {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(appConfig.BASE_WALLET_MANAGER_ADDRESS, signer);

      const rawTransactions = await walletManager.getAllTransactions();
      const transactions = rawTransactions.map((tx: any) => ({
        network: tx.network,
        wallet: tx.wallet,
        amount: (Number(tx.amount) / 1e18).toString(),
        tokenSymbol: tx.tokenSymbol,
        tokenAddress: tx.tokenAddress,
        timestamp: tx.timestamp.toString()
      }));

      return transactions;
    } catch (err: any) {
      console.error("Get recent transactions failed:", err);
      throw new BadRequestException(err.message || "Get recent transactions failed");
    }
  }

  // -------------------------
  // UPLOAD IMAGE USING AXIOS
  // -------------------------
  async uploadImage(file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException("Image file not provided");
      }

      const form = new FormData();
      form.append("file", file.buffer, { filename: file.originalname });
      form.append("upload_preset", appConfig.CLOUDINARY_UPLOAD_PRESET);

      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${appConfig.CLOUDINARY_CLOUD_NAME}/image/upload`,
        form,
        {
          headers: form.getHeaders(), // very important!
        }
      );

      const data = response.data;

      if (!data.secure_url) {
        throw new BadRequestException("Cloudinary upload failed");
      }

      return { success: true, imageUrl: data.secure_url };
    } catch (err: any) {
      throw new BadRequestException(err.response?.data || err.message || "Image upload failed");
    }
  }
}
