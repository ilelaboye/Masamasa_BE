import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawTokenDto } from "./web3.dto";
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
import base58 from "bs58";
import { sweepSPLToken } from "./Sol";
import { Transactions } from "../transactions/transactions.entity";

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
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(Transactions)
    private readonly transactionRepository: Repository<Transactions>,
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
  async walletsTracking(req) {
    await this.initHDWallet();
    const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
    const masterWallet = this.hd.getMasterWallet(this.provider);
    const transactionsTron = await this.transactionRepository
      .createQueryBuilder("transactions")
      .where("transactions.user_id = :user_id AND transactions.network = :network", {
        user_id: req.user.id,
        network: "Tron",
      })
      .orderBy("transactions.created_at", "DESC")
      .getMany(); // fetch results

    const transactionsADA = await this.transactionRepository
      .createQueryBuilder("transactions")
      .where("transactions.user_id = :user_id AND transactions.network = :network", {
        user_id: req.user.id,
        network: "Cardano", // fixed typo "Cadano" → "Cardano"
      })
      .orderBy("transactions.created_at", "DESC")
      .getMany(); // fetch results

    const formattedTransactions = transactionsTron.map(tx => ({
      network: tx.network,
      token_symbol: tx.metadata?.token_symbol,
      amount: tx.metadata?.amount,
      created_at: tx.created_at
    }));

    const masterWalletTron = this.hdTRX.getMasterWallet();
    const w = await this.walletRepository.findOne({ where: { user: req.user.id } });

    if (!w) return false;
    const tronChildWallet = this.hdTRX.getChildAddress(req.user.id);

    try {
      const tron = await this.hdTRX.getChildTRC20History(req.user.id, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

      // Get the most recent DB transaction timestamp for TRON
      const latestDbTronTime = formattedTransactions.reduce((latest, tx: any) => {
        const txTime = new Date(tx.metadata?.timestamp || tx.created_at).getTime();
        return txTime > latest ? txTime : latest;
      }, 0);

      // Filter unmatched TRON transactions
      const unmatchedTronTransactions = tron.filter(onChainTx => {
        const onChainTime = new Date(onChainTx.date).getTime();
        return (
          onChainTime > latestDbTronTime // only after latest DB tx
        );
      });
      if (unmatchedTronTransactions && unmatchedTronTransactions.length > 0.1) {
        unmatchedTronTransactions.map(async (a: any) => {
          await this.hdADA.ApitransactionWebhook({
            network: "Tron",
            address: tronChildWallet,
            amount: a.amount,
            token_symbol: a.symbol
          })
        })
      }

    } catch (err) {
      console.log(err)
    }
    return { transactions: true }
  }

  async sweepWallets(req) {
    await this.initHDWallet();
    const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
    const masterWallet = this.hd.getMasterWallet(this.provider);

    const masterWalletTron = this.hdTRX.getMasterWallet();
    const masterWalletSOL = this.hdSol.getMasterKeypair().publicKey.toBase58();


    // Fetch the user's wallet
    const w = await this.walletRepository.findOne({ where: { user: req.user.id } });
    const w2 = await this.walletRepository.findOne({ where: { wallet_address: "TLKtezKsvMT2Koez8LXGhgVmBvX9pAJSxK" } });
    if (!w) return false;

    try {
      const ERC20_TOKENS: Record<string, string> = {
        BASE_USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base USDT
        BASE_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // BASE USDC
        BASE_BTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // BASE BTC
        BASE_BNB: "0xf7158362807485ae32b6e0b40fd613c70629e9be",
        BNB_USDT: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
        BNB_USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC USDT
        BNB_RIPPLE: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // BSC XRP
        BNB_DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // BSC DOGE
        BNB_BTC: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BSC BTC
        SOL_USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        SOL_USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        // Add Base USDT/USDC addresses here if needed
      };

      // -----------------------------
      // BASE and BSC
      // -----------------------------
      if (w) {
        const childWallet = this.hd.getChildWallet(Number(req.user.id), this.providerBase);
        const childWallet2 = this.hd.getChildWallet(Number(req.user.id), this.provider);
        const childWallet3 = this.hdTRX.deriveChild(43);
        const childWallet4 = this.hdSol.deriveKeypair(Number(req.user.id));
        console.log(childWallet3, "child");

        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_USDT"], "BASE", "USDT");
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_USDC"], "BASE", "USDC");
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_BTC"], "BASE", "BTC");
        await this.hd.sweepToken(childWallet, masterWalletBase, ERC20_TOKENS["BASE_BNB"], "BASE", "BNB");
        //bsc erc20 tokens
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_USDT"], "BINANCE CHAIN", "USDT");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_USDC"], "BINANCE CHAIN", "USDC");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_RIPPLE"], "BINANCE CHAIN", "XRP");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_DOGE"], "BINANCE CHAIN", "DOGE");
        await this.hd.sweepToken(childWallet2, masterWallet, ERC20_TOKENS["BNB_BTC"], "BINANCE CHAIN", "BTC");
        console.log("Complete token sweep");

        try {
          await this.hd.sweep(childWallet, masterWalletBase, "BASE", "ETH");
        } catch (e) {
          console.log(e)
        }
        try {
          await this.hd.sweep(childWallet2, masterWallet, "BINANCE CHAIN", "BNB");
        } catch (e) {
          console.log(e)
        } // //BASE ERC20 tokens
        const childKeySol = Buffer.from(childWallet4.secretKey).toString("hex");



        await sweepSPLToken(
          childWallet4.secretKey,
          this.hdSol.getMasterKeypair(),
          ERC20_TOKENS["SOL_USDT"],
          this.conn,
          "USDT"
        );
        await sweepSPLToken(
          childWallet4.secretKey,
          this.hdSol.getMasterKeypair(),
          ERC20_TOKENS["SOL_USDC"],
          this.conn,
          "USDC"
        );
        await this.hdSol.sweepSOL(
          { address: childWallet4.publicKey.toBase58(), privateKey: childKeySol },
          masterWalletSOL,
          this.conn,
          req.user.id
        );

        // trc20
        await this.hdTRX.sweepTRC20(childWallet3, masterWalletTron, "https://api.trongrid.io", ERC20_TOKENS["TRON_USDT"])

        await this.hdTRX.sweepTRON(childWallet3, masterWalletTron.address, "https://api.trongrid.io");
        // ada
        const txHash = await this.hdADA.sweepADA(req.user.id, this.hdADA.generateAddress(0), appConfig.BLOCK_API_KEY ?? "", true);

      }
    } catch (err: any) {
      console.error(`Failed to for user ${req.user.id}:`, err);
      return false;
    }

    console.log("Sweep completed for user", req.user.id);
    return true;
  }

  async withdrawToken(payload: WithdrawTokenDto) {
    try {
      await this.initHDWallet();
      const ERC20_TOKENS: Record<string, string> = {
        BASE_USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base USDT
        BASE_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // BASE USDC
        BASE_BTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // BASE BTC
        BASE_BNB: "0xf7158362807485ae32b6e0b40fd613c70629e9be",
        BNB_USDT: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
        BNB_USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC USDC
        BNB_RIPPLE: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // BSC XRP
        BNB_DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // BSC DOGE
        BNB_BTC: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BSC BTC
        SOL_USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        SOL_USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
      };

      // Determine which provider to use based on network
      let provider: ethers.JsonRpcProvider;
      const network = payload.network?.toUpperCase() || "BASE";
      const symbol = payload.symbol?.toUpperCase() || "";

      if (network === "BASE") {
        provider = this.providerBase;
      } else if (network === "BINANCE" || network === "BSC" || network === "BNB") {
        provider = this.provider;
      } else {
        provider = this.providerBase; // default to Base
      }

      // Determine token address based on network and symbol
      let tokenAddress: string | undefined;

      // Check if it's a native token withdrawal (ETH or BNB)
      if (symbol === "ETH" || symbol === "BNB") {
        tokenAddress = undefined; // Native token
      } else {
        // Build the key for ERC20 token lookup
        const tokenKey = `${network}_${symbol}`;
        tokenAddress = ERC20_TOKENS[tokenKey];

        if (!tokenAddress) {
          throw new BadRequestException(
            `Token ${symbol} not supported on ${network} network. Available tokens: ${Object.keys(ERC20_TOKENS).filter(k => k.startsWith(network)).map(k => k.split('_')[1]).join(', ')}`
          );
        }
      }

      // Use the new withdrawFromMaster method
      const txHash = await this.hd.withdrawFromMaster(
        provider,
        payload.to,
        payload.amount.toString(),
        tokenAddress,
        network,
        symbol
      );

      return { success: true, txHash };
    } catch (err: any) {
      throw new BadRequestException(err.message || "Withdrawal failed");
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

    const ERC20_TOKENS: Record<string, string> = {
      BASE_USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base USDT
      BASE_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // BASE USDC
      BASE_BTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // BASE BTC
      BASE_BNB: "0xf7158362807485ae32b6e0b40fd613c70629e9be",
      BNB_USDT: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
      BNB_USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC USDT
      BNB_RIPPLE: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // BSC XRP
      BNB_DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // BSC DOGE
      BNB_BTC: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BSC BTC
      SOL_USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      SOL_USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
      // Add Base USDT/USDC addresses here if needed
    };


    try {
      const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
      const masterWallet = this.hd.getMasterWallet(this.provider);

      const masterWalletTron = this.hdTRX.getMasterWallet();
      const masterWalletSOL = this.hdSol.getMasterKeypair().publicKey.toBase58();

      const baseBalance = await this.hd.getETHBalance(masterWalletBase)
      const bnbBalance = await this.hd.getETHBalance(masterWallet)
      const solBalance = await this.hdSol.getSolBalance(this.conn, masterWalletSOL)

      //base
      const baseUSDT = await this.hd.getERC20Balance(masterWalletBase, ERC20_TOKENS["BASE_USDT"])
      const baseUSDC = await this.hd.getERC20Balance(masterWalletBase, ERC20_TOKENS["BASE_USDC"])
      const baseBTC = await this.hd.getERC20Balance(masterWalletBase, ERC20_TOKENS["BASE_BTC"])
      const baseBNB = await this.hd.getERC20Balance(masterWalletBase, ERC20_TOKENS["BASE_BNB"])

      //BNB
      const BNBUSDT = await this.hd.getERC20Balance(masterWallet, ERC20_TOKENS["BNB_USDT"])
      const BNBUSDC = await this.hd.getERC20Balance(masterWallet, ERC20_TOKENS["BNB_USDC"])
      const BNBBTC = await this.hd.getERC20Balance(masterWallet, ERC20_TOKENS["BNB_BTC"])
      const BNBRIPPLE = await this.hd.getERC20Balance(masterWallet, ERC20_TOKENS["BNB_RIPPLE"])
      const BNBDOGE = await this.hd.getERC20Balance(masterWallet, ERC20_TOKENS["BNB_DOGE"])

      //SOL
      const solUSDT = await this.hdSol.getSPLTokenBalance(this.conn, masterWalletSOL, ERC20_TOKENS["SOL_USDT"])
      const solUSDC = await this.hdSol.getSPLTokenBalance(this.conn, masterWalletSOL, ERC20_TOKENS["SOL_USDC"])


      // const masterTRX = this.hdTRX.getMasterWallet().address;
      //   const trxBalance = (await this.tronWeb.trx.getBalance(masterTRX)) / 1e6;
      //   const trxUSDTBalance = await this.getTokenBalanceTRX(ERC20_TOKENS["TRON_USDT"]);
      const cardanoChild = await this.hdADA.getChildBalance(0, appConfig.BLOCK_API_KEY ?? "", true);

      return {
        base: {
          ETH: baseBalance,
          USDT: baseUSDT,
          USDC: baseUSDC,
          BTC: baseBTC,
          BNB: baseBNB,
        },
        binance: {
          BNB: bnbBalance,
          USDT: BNBUSDT,
          USDC: BNBUSDC,
          BTC: BNBBTC,
          RIPPLE: BNBRIPPLE,
          DOGE: BNBDOGE
        },
        sol: {
          SOL: solBalance,
          USDT: solUSDT,
          USDC: solUSDC
        },
        TRX: { TRX: 0.51, USDT: 1 },
        ADA: {
          ADA: cardanoChild.lovelace + 2
        }
        // SOL: solBalance,
        // SOL_USDC: solUSDCBalance,
        // SOL_USDT: solUSDTBalance
      };
    } catch (err: any) {
      console.log(err)
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
