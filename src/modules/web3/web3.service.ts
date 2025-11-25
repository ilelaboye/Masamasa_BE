import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawEthDto, WithdrawTokenDto } from "./web3.dto";
import FormData from "form-data"; //

// ABI for WalletManagerRemix (relevant functions)
const walletManagerAbi = [
  "function getWalletByUserId(string userId) view returns (address)",
  "function createWallet(string userId) returns (address)",
  "function getAllBalances() view returns (tuple(string symbol, uint256 balance)[])",
  "function getAllTransactions() view returns (tuple(string network, address wallet, uint256 amount, string tokenSymbol, address tokenAddress, uint256 timestamp)[])",
  "function getTokenBalance(address tokenAddress) view returns (uint256)",
  "function withdrawContractETH(uint256 amount, address payable to)",
  "function withdrawContractToken(address tokenAddress, uint256 amount, address to)"
];

@Injectable()
export class Web3Service {

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
  private getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
    return new ethers.Contract(appConfig.ETH_WALLET_MANAGER_ADDRESS ?? "", walletManagerAbi, signerOrProvider);
  }

  //--------------------------------------
  // CREATE WALLET
  //--------------------------------------
  async createWallet(req, payload: any) {
    try {
      const provider = new ethers.JsonRpcProvider(appConfig.ETH_RPC_URL);
      const signer = new ethers.Wallet(appConfig.BASE_PRIVATE_KEY, provider);
      const walletManager = this.getContract(signer);

      let walletAddress: string;
      try {
        walletAddress = await walletManager.getWalletByUserId(payload.id);
      } catch {
        walletAddress = ethers.ZeroAddress;
      }

      if (!walletAddress || walletAddress === ethers.ZeroAddress) {
        const tx = await walletManager.createWallet(payload.id);
        const receipt = await tx.wait();

        // optional: get wallet address from event
        const event = receipt.events?.find((e: any) => e.event === "WalletCreated");
        walletAddress = await walletManager.getWalletByUserId(payload.id);

        // Send wallet info to external API
        await axios.post("https://api-masamasa.usemorney.com/wallet/create", {
          network: "Ethereum",
          currency: "ETH",
          wallet_address: walletAddress,
          user_id: payload.id
        });
      }

      return walletAddress;
    } catch (err: any) {
      return err;
    }
  }

  //--------------------------------------
  // WITHDRAW ETH
  //--------------------------------------
  async withdrawETH(req, payload:WithdrawEthDto) {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(signer);

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
  async withdrawToken(payload:WithdrawTokenDto) {
    try {
      const signer = this.getSigner();
      const walletManager = this.getContract(signer);

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
      const walletManager = this.getContract(signer);

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
      const walletManager = this.getContract(signer);

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
