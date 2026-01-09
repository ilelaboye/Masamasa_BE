import { Injectable, BadRequestException } from "@nestjs/common";
import { ethers, formatUnits } from "ethers";
import axios from "axios";
import { appConfig } from "@/config";
import { WithdrawTokenDto } from "./web3.dto";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
import { BtcHDWallet } from "./btc-hd-wallet";
import { XrpHDWallet } from "./xrp-hd-wallet";
import base58 from "bs58";
import { sweepSPLToken } from "./Sol";
import { Transactions } from "../transactions/transactions.entity";
import { PublicService } from "../global/public/public.service";

const TronWeb = require("tronweb");

const walletManagerAbi = [
  "function getWalletByUserId(string userId) view returns (address)",
  "function createWallet(string userId) returns (address)",
  "function getAllBalances() view returns (tuple(string symbol, uint256 balance)[])",
  "function network() view returns (string)",
  "function getAllTransactions() view returns (tuple(string network, address wallet, uint256 amount, string tokenSymbol, address tokenAddress, uint256 timestamp)[])",
  "function getTokenBalance(address tokenAddress) view returns (uint256)",
  "function withdrawContractETH(uint256 amount, address payable to)",
  "function withdrawContractToken(address tokenAddress, uint256 amount, address to)",
];

@Injectable()
export class Web3Service {
  private hd!: HDWallet;
  private provider: ethers.JsonRpcProvider;
  private providerBase: ethers.JsonRpcProvider;
  private providerETH: ethers.JsonRpcProvider;
  private conn: Connection;
  private hdSol: SolHDWallet;
  private hdTRX: TronHDWallet;
  private tronWeb: any;
  private hdADA: CardanoHDWallet;
  private hdBTC: BtcHDWallet;
  private hdXrp: XrpHDWallet;
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(Transactions)
    private readonly transactionRepository: Repository<Transactions>,

    private readonly publicService: PublicService,
  ) {
    this.provider = new ethers.JsonRpcProvider(appConfig.EVM_RPC_URL);
    this.providerBase = new ethers.JsonRpcProvider(appConfig.BASE_RPC_URL);
    this.providerETH = new ethers.JsonRpcProvider(appConfig.ETH_RPC_URL);
    if (!appConfig.MASTER_MNEMONIC) {
      throw new Error("MASTER_MNEMONIC is missing in .env");
    }

    this.conn = new Connection(appConfig.SOL_RPC_URL, "confirmed");
    this.hdSol = new SolHDWallet(
      appConfig.SOL_MASTER_MNEMONIC,
      this.publicService,
    );
    this.hdTRX = new TronHDWallet(
      appConfig.TRX_MASTER_MNEMONIC,
      "https://api.trongrid.io",
      this.publicService,
    );
    this.tronWeb = this.hdTRX.getTronWebInstance();
    this.hdADA = new CardanoHDWallet(
      appConfig.ADA_MASTER_MNEMONIC,
      this.publicService,
    );
    this.hdBTC = new BtcHDWallet(
      appConfig.BTC_MASTER_MNEMONIC,
      false,
      this.publicService,
    );
    this.hdXrp = new XrpHDWallet(appConfig.MASTER_MNEMONIC, this.publicService);
  }

  // -----------------------------
  // INIT HDWallet (async)
  // -----------------------------
  private async initHDWallet() {
    if (!this.hd) {
      this.hd = await HDWallet.fromMnemonic(
        appConfig.MASTER_MNEMONIC,
        this.publicService,
      );
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
  private getContract(
    address?: string,
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ) {
    return new ethers.Contract(
      address ?? "",
      walletManagerAbi,
      signerOrProvider,
    );
  }

  // -----------------------------
  // CREATE HD WALLET FOR USER
  // -----------------------------
  async createWallet(req, payload: any) {
    await this.initHDWallet(); // ensure hd wallet is ready

    try {
      const userId = payload.id.toString();

      const childWallet = this.hd.getChildWallet(userId, this.provider);
      const solChildWallet = this.hdSol
        .deriveKeypair(userId)
        .publicKey.toBase58();
      const tronChildWallet = this.hdTRX.getChildAddress(userId);


      const existWalletETH = await this.walletRepository.findOne({
        where: { wallet_address: childWallet.address },
      });
      const existWalletSOL = await this.walletRepository.findOne({
        where: { wallet_address: solChildWallet },
      });
      const existWalletTRX = await this.walletRepository.findOne({
        where: { wallet_address: tronChildWallet },
      });
      const cardanoChild = this.hdADA.generateAddress(userId, true);
      const existWalletADA = await this.walletRepository.findOne({
        where: { wallet_address: cardanoChild },
      });
      const btcChild = this.hdBTC.generateAddress(Number(userId));
      const existWalletBTC = await this.walletRepository.findOne({
        where: { wallet_address: btcChild },
      });
      const xrpMasterAddress = await this.hdXrp.getMasterAddress();
      const xrpWalletAddress = `${xrpMasterAddress}:${44011 + Number(userId)}`;
      const existWalletXRP = await this.walletRepository.findOne({
        where: { wallet_address: xrpWalletAddress },
      });

      if (!existWalletBTC) {
        const btc = this.walletRepository.create({
          user: req.user,
          network: "BITCOIN",
          currency: "BTC",
          wallet_address: btcChild,
        });
        await this.walletRepository.save(btc);
      }

      if (!existWalletADA) {
        const ada = this.walletRepository.create({
          user: req.user,
          network: "CARDANO",
          currency: "ADA",
          wallet_address: cardanoChild,
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
          wallet_address: solChildWallet,
        });
        await this.walletRepository.save(sol);
      }

      if (!existWalletTRX) {
        const trx = this.walletRepository.create({
          user: req.user,
          network: "TRON",
          currency: "TRX",
          wallet_address: tronChildWallet,
        });
        await this.walletRepository.save(trx);
      }

      if (!existWalletXRP) {
        const xrp = this.walletRepository.create({
          user: req.user,
          network: "RIPPLE",
          currency: "XRP",
          wallet_address: xrpWalletAddress,
        });
        await this.walletRepository.save(xrp);
      }

      return {
        eth: childWallet.address,
        sol: solChildWallet,
        trx: tronChildWallet,
        ada: cardanoChild,
        btc: btcChild,
        xrp: xrpWalletAddress,
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

    const masterWalletTron = this.hdTRX.getMasterWallet();
    const w = await this.walletRepository.findOne({
      where: { user: req.user.id },
    });

    if (!w) return false;
    const tronChildWallet = this.hdTRX.getChildAddress(req.user.id);


    try {
      // TRON TRACKING - using hash matching like ADA/XRP
      const onChainTron = await this.hdTRX.getChildTRC20History(
        req.user.id,
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      );

      const dbTronTransactions = await this.transactionRepository
        .createQueryBuilder("transactions")
        .where("transactions.user_id = :userId AND transactions.network = :network", {
          userId: req.user.id,
          network: "Tron"
        })
        .getMany();

      const existingHashes = dbTronTransactions.map(tx => tx.metadata?.hash);

      const unmatchedTron = onChainTron.filter(tx => !existingHashes.includes(tx.txID));

      for (const tx of unmatchedTron) {
        await this.hdADA.ApitransactionWebhook({
          network: "Tron",
          address: tronChildWallet,
          amount: tx.amount,
          token_symbol: tx.symbol,
          hash: tx.txID,
        });
      }
    } catch (err) {
      console.error("TRON Tracking failed:", err.message);
    }

    try {
      // XRP TRACKING
      const xrpMasterAddress = await this.hdXrp.getMasterAddress();
      const xrpDestinationTag = 44011 + Number(req.user.id);

      const onChainXrp = await this.hdXrp.getHistoryByUserId(req.user.id, 10);

      console.log("onChainXrp", onChainXrp, xrpMasterAddress);
      const dbXrpTransactions = await this.transactionRepository
        .createQueryBuilder("transactions")
        .where("transactions.user_id = :userId AND transactions.network = :network", {
          userId: req.user.id,
          network: "RIPPLE"
        })
        .getMany();

      const existingHashes = dbXrpTransactions.map(tx => tx.metadata?.hash);

      const unmatchedXrp = onChainXrp.filter(tx => !existingHashes.includes(tx.txID));

      for (const tx of unmatchedXrp) {
        await this.hdADA.ApitransactionWebhook({
          network: "RIPPLE",
          address: `${xrpMasterAddress}:${xrpDestinationTag}`,
          amount: tx.amount,
          token_symbol: "XRP",
          hash: tx.txID
        });
      }
    } catch (err) {
      console.error("XRP Tracking failed:", err.message);
    }

    return { transactions: true };
  }

  async sweepWallets(req) {
    await this.initHDWallet();
    const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
    const masterWalletETH = this.hd.getMasterWallet(this.providerETH);
    const masterWallet = this.hd.getMasterWallet(this.provider);

    const masterWalletTron = this.hdTRX.getMasterWallet();
    const masterWalletSOL = this.hdSol.getMasterKeypair().publicKey.toBase58();

    // Fetch the user's wallet
    const w = await this.walletRepository.findOne({
      where: { user: req.user.id },
    });
    const w2 = await this.walletRepository.findOne({
      where: { wallet_address: "TLKtezKsvMT2Koez8LXGhgVmBvX9pAJSxK" },
    });
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
        TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        // Add Base USDT/USDC addresses here if needed
      };

      // -----------------------------
      // BASE and BSC
      // -----------------------------
      if (w) {
        const childWallet = this.hd.getChildWallet(
          Number(req.user.id),
          this.providerBase,
        );
        const childWallet2 = this.hd.getChildWallet(
          Number(req.user.id),
          this.provider,
        );
        const childWallet3 = this.hdTRX.deriveChild(Number(req.user.id));
        const childWallet4 = this.hdSol.deriveKeypair(Number(req.user.id));
        const childWallet5 = this.hd.getChildWallet(
          Number(req.user.id),
          this.providerETH,
        );

        //BASE
        try {
          await this.hdBTC.sweepBTC(req.user.id, this.hdBTC.generateAddress(0));
        } catch {
          console.log("BTC sweep failed");
        }

        try {
          await this.hd.sweepToken(
            childWallet,
            masterWalletBase,
            ERC20_TOKENS["BASE_USDT"],
            "BASE",
            "USDT",
          );
        } catch (e) {
          console.log("BASE_USDT sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet,
            masterWalletBase,
            ERC20_TOKENS["BASE_USDC"],
            "BASE",
            "USDC",
          );
        } catch (e) {
          console.log("BASE_USDC sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet,
            masterWalletBase,
            ERC20_TOKENS["BASE_BTC"],
            "BASE",
            "BTC",
          );
        } catch (e) {
          console.log("BASE_BTC sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet,
            masterWalletBase,
            ERC20_TOKENS["BASE_BNB"],
            "BASE",
            "BNB",
          );
        } catch (e) {
          console.log("BASE_BNB sweep failed", e);
        }
        //bsc erc20 tokens
        try {
          await this.hd.sweepToken(
            childWallet2,
            masterWallet,
            ERC20_TOKENS["BNB_USDT"],
            "BINANCE CHAIN",
            "USDT",
          );
        } catch (e) {
          console.log("BNB_USDT sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet2,
            masterWallet,
            ERC20_TOKENS["BNB_USDC"],
            "BINANCE CHAIN",
            "USDC",
          );
        } catch (e) {
          console.log("BNB_USDC sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet2,
            masterWallet,
            ERC20_TOKENS["BNB_RIPPLE"],
            "BINANCE CHAIN",
            "XRP",
          );
        } catch (e) {
          console.log("BNB_RIPPLE sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet2,
            masterWallet,
            ERC20_TOKENS["BNB_DOGE"],
            "BINANCE CHAIN",
            "DOGE",
          );
        } catch (e) {
          console.log("BNB_DOGE sweep failed", e);
        }

        try {
          await this.hd.sweepToken(
            childWallet2,
            masterWallet,
            ERC20_TOKENS["BNB_BTC"],
            "BINANCE CHAIN",
            "BTC",
          );
        } catch (e) {
          console.log("BNB_BTC sweep failed", e);
        }
        console.log("Complete token sweep");

        try {
          //BASE
          await this.hd.sweep(childWallet, masterWalletBase, "BASE", "ETH");
        } catch (e) {
          console.log(e);
        }
        try {
          //BSC
          await this.hd.sweep(
            childWallet2,
            masterWallet,
            "BINANCE CHAIN",
            "BNB",
          );
        } catch (e) {
          console.log(e);
        }
        try {
          //ETH
          await this.hd.sweep(childWallet5, masterWalletETH, "ETHEREUM", "ETH");
        } catch (e) {
          console.log(e);
        }
        // //BASE ERC20 tokens
        const childKeySol = Buffer.from(childWallet4.secretKey).toString("hex");

        try {
          await sweepSPLToken(
            childWallet4.secretKey,
            this.hdSol.getMasterKeypair(),
            ERC20_TOKENS["SOL_USDT"],
            this.conn,
            "USDT",
          );
        } catch (e) {
          console.log("SOL_USDT sweep failed", e);
        }

        try {
          await sweepSPLToken(
            childWallet4.secretKey,
            this.hdSol.getMasterKeypair(),
            ERC20_TOKENS["SOL_USDC"],
            this.conn,
            "USDC",
          );
        } catch (e) {
          console.log("SOL_USDC sweep failed", e);
        }
        console.log("Complete token sweep sol");
        try {
          await this.hdSol.sweepSOL(
            {
              address: childWallet4.publicKey.toBase58(),
              privateKey: childKeySol,
            },
            masterWalletSOL,
            this.conn,
            req.user.id,
          );
        } catch (e) {
          console.log("SOL sweep failed", e);
        }

        // trc20
        // await this.hdTRX.sweepTRC20(childWallet3, masterWalletTron, "https://api.trongrid.io", ERC20_TOKENS["TRON_USDT"])

        try {
          await this.hdTRX.sweepTRON(
            childWallet3,
            masterWalletTron.address,
            "https://api.trongrid.io",
          );
        } catch (e) {
          console.log("TRON sweep failed", e);
        }
        // ada
        try {
          const txHash = await this.hdADA.sweepADA(
            req.user.id,
            this.hdADA.generateAddress(0),
            appConfig.BLOCK_API_KEY ?? "",
            true,
          );
        } catch (e) {
          console.log("ADA sweep failed", e);
        }

        // btc

        // xrp
        try {
          await this.hdXrp.sweepXRP(
            Number(req.user.id),
            (await this.hdXrp.getMasterWallet()).address,
          );
        } catch (e) {
          console.log("XRP sweep failed", e);
        }
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
        TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      };

      // Determine which provider to use based on network
      const network = payload.network?.toUpperCase() || "BASE";
      const symbol = payload.symbol?.toUpperCase() || "";
      const amount = Number(payload.amount);

      if (network === "BITCOIN" || network === "BTC") {
        const txHash = await this.hdBTC.withdrawBTC(
          this.hdBTC.generateAddress(0),
          payload.to,
          amount,
        );
        return { success: true, txHash };
      }

      if (network === "CARDANO" || network === "ADA") {
        const txHash = await this.hdADA.withdrawADA(
          payload.to,
          amount,
          appConfig.BLOCK_API_KEY ?? "",
          true,
        );
        return { success: true, txHash };
      }

      if (network === "SOLANA" || network === "SOL") {
        let txHash: string;
        if (symbol === "SOL") {
          txHash = await this.hdSol.withdrawSOL(payload.to, amount, this.conn);
        } else {
          const tokenMint = ERC20_TOKENS[`SOL_${symbol}`];
          if (!tokenMint) throw new Error(`Unsupported SOL token: ${symbol}`);
          txHash = await this.hdSol.withdrawSPLToken(
            payload.to,
            amount,
            tokenMint,
            this.conn,
          );
        }
        return { success: true, txHash };
      }

      if (network === "TRON" || network === "TRX") {
        let txHash: string;
        if (symbol === "TRX") {
          txHash = await this.hdTRX.withdrawTRX(payload.to, amount);
        } else {
          const tokenAddress = ERC20_TOKENS[`TRON_${symbol}`];
          if (!tokenAddress)
            throw new Error(`Unsupported TRON token: ${symbol}`);
          txHash = await this.hdTRX.withdrawTRC20(
            payload.to,
            amount,
            tokenAddress,
          );
        }
        return { success: true, txHash };
      }

      if (network === "RIPPLE" || network === "XRP") {
        const txHash = await this.hdXrp.withdrawXRP(payload.to, amount, payload.destinationTag);
        return { success: true, txHash };
      }

      let provider: ethers.JsonRpcProvider;
      if (network === "BASE") {
        provider = this.providerBase;
      } else if (
        network === "BINANCE" ||
        network === "BSC" ||
        network === "BNB"
      ) {
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
            `Token ${symbol} not supported on ${network} network. Available tokens: ${Object.keys(
              ERC20_TOKENS,
            )
              .filter((k) => k.startsWith(network))
              .map((k) => k.split("_")[1])
              .join(", ")}`,
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
        symbol,
      );

      return { success: true, txHash };
    } catch (err: any) {
      throw new BadRequestException(err.message || "Withdrawal failed");
    }
  }

  // -----------------------------
  // GET TOKEN BALANCES
  // -----------------------------
  private async getTokenBalanceETH(
    tokenAddress: string,
    decimals = 18,
  ): Promise<number> {
    await this.initHDWallet();
    const masterAddress = this.hd.getMasterWallet(this.provider).address;
    if (!tokenAddress) return 0;

    const contract = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)"],
      this.provider,
    );

    const balance = await contract.balanceOf(masterAddress);
    return Number(formatUnits(balance, decimals));
  }

  private async getTokenBalanceTRX(tokenAddress: string): Promise<number> {
    if (!tokenAddress) return 0;
    const master = this.hdTRX.getMasterWallet().address;
    try {
      const contract = await this.tronWeb.contract().at(tokenAddress);
      const balance = await contract.balanceOf(master).call();
      return Number(balance) / 1e6;
    } catch (err) {
      console.error(
        `Failed to fetch TRX token balance for ${tokenAddress}:`,
        err.message || err,
      );
      return 0;
    }
  }

  private async getTokenBalanceSOL(
    tokenMint: PublicKey,
    owner: PublicKey,
  ): Promise<number> {
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
      TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      // Add Base USDT/USDC addresses here if needed
    };

    try {
      const masterWalletBase = this.hd.getMasterWallet(this.providerBase);
      const masterWalletETH = this.hd.getMasterWallet(this.providerETH);
      const masterWallet = this.hd.getMasterWallet(this.provider);

      const masterWalletTron = this.hdTRX.getMasterWallet();
      const masterWalletSOL = this.hdSol
        .getMasterKeypair()
        .publicKey.toBase58();

      const baseBalance = await this.hd.getETHBalance(masterWalletBase);
      const ethBalance = await this.hd.getETHBalance(masterWalletETH);
      const bnbBalance = await this.hd.getETHBalance(masterWallet);
      const solBalance = await this.hdSol.getSolBalance(
        this.conn,
        masterWalletSOL,
      );

      //base
      const baseUSDT = await this.hd.getERC20Balance(
        masterWalletBase,
        ERC20_TOKENS["BASE_USDT"],
      );
      const baseUSDC = await this.hd.getERC20Balance(
        masterWalletBase,
        ERC20_TOKENS["BASE_USDC"],
      );
      const baseBTC = await this.hd.getERC20Balance(
        masterWalletBase,
        ERC20_TOKENS["BASE_BTC"],
      );
      const baseBNB = await this.hd.getERC20Balance(
        masterWalletBase,
        ERC20_TOKENS["BASE_BNB"],
      );

      //BNB
      const BNBUSDT = await this.hd.getERC20Balance(
        masterWallet,
        ERC20_TOKENS["BNB_USDT"],
      );
      const BNBUSDC = await this.hd.getERC20Balance(
        masterWallet,
        ERC20_TOKENS["BNB_USDC"],
      );
      const BNBBTC = await this.hd.getERC20Balance(
        masterWallet,
        ERC20_TOKENS["BNB_BTC"],
      );
      const BNBRIPPLE = await this.hd.getERC20Balance(
        masterWallet,
        ERC20_TOKENS["BNB_RIPPLE"],
      );
      const BNBDOGE = await this.hd.getERC20Balance(
        masterWallet,
        ERC20_TOKENS["BNB_DOGE"],
      );

      //SOL
      const solUSDT = await this.hdSol.getSPLTokenBalance(
        this.conn,
        masterWalletSOL,
        ERC20_TOKENS["SOL_USDT"],
      );
      const solUSDC = await this.hdSol.getSPLTokenBalance(
        this.conn,
        masterWalletSOL,
        ERC20_TOKENS["SOL_USDC"],
      );

      let trxBalance = 0;
      let trxUSDTBalance = 0;
      try {
        const masterTRX = this.hdTRX.getMasterWallet().address;
        trxBalance = (await this.tronWeb.trx.getBalance(masterTRX)) / 1e6;
        trxUSDTBalance = await this.getTokenBalanceTRX(
          ERC20_TOKENS["TRON_USDT"],
        );
      } catch (err) {
        console.error("TRX balance fetch error:", err.message || err);
      }

      const cardanoChild = await this.hdADA.getChildBalance(
        0,
        appConfig.BLOCK_API_KEY ?? "",
        true,
      );
      const btcBalance = await this.hdBTC.getBalance(
        this.hdBTC.generateAddress(0),
      );
      const xrpBalance = await this.hdXrp.getBalance(
        (await this.hdXrp.getMasterWallet()).address,
      );

      return {
        ethereum: {
          ETH: ethBalance,
        },
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
          DOGE: BNBDOGE,
        },
        sol: {
          SOL: solBalance,
          USDT: solUSDT,
          USDC: solUSDC,
        },
        TRX: { TRX: trxBalance, USDT: trxUSDTBalance },
        ADA: {
          ADA: cardanoChild.lovelace,
        },
        BTC: {
          BTC: btcBalance,
        },
        RIPPLE: {
          XRP: xrpBalance,
        },
      };
    } catch (err: any) {
      console.log(err);
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
        timestamp: tx.timestamp.toString(),
      }));
    } catch (err: any) {
      throw new BadRequestException(
        err.message || "Get recent transactions failed",
      );
    }
  }

  async getLastTransactionsFromBlockchain(req: any) {
    await this.initHDWallet();
    const userId = req.user.id;
    const limit = 3;

    try {
      const histories = await Promise.all([
        // Native
        this.hdBTC.getChildTransactionHistory(userId, limit),
        this.hdADA.getChildTransactionHistoryFirst3(
          userId,
          appConfig.BLOCK_API_KEY ?? "",
          true,
        ),

        // Tokens
        // Tron
        this.hdTRX.getChildTRC20History(
          userId,
          "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
          limit,
        ), // USDT


        // Ripple
        this.hdXrp.getHistoryByUserId(userId, limit),
      ]);

      const flatHistory = histories.flat();

      // Normalize results
      const normalized = flatHistory.map((tx: any) => ({
        address: tx.to || tx.address || "",
        timestamp:
          tx.timestamp || (tx.date ? new Date(tx.date).getTime() : Date.now()),
        amount: tx.amount,
        symbol: tx.token_symbol || tx.symbol || "",
        status: tx.status || "success",
        network:
          tx.network ||
          (tx.token_symbol === "BTC"
            ? "BITCOIN"
            : tx.token_symbol === "ADA"
              ? "CARDANO"
              : tx.token_symbol === "SOL"
                ? "SOLANA"
                : tx.token_symbol === "TRX"
                  ? "TRON"
                  : tx.token_symbol === "XRP"
                    ? "RIPPLE"
                    : ""),
        txID: tx.txID || tx.hash || "",
      }));

      // Sort by timestamp desc and take top 3
      return normalized.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
    } catch (err: any) {
      console.error("Failed to fetch all blockchain histories:", err.message);
      throw new BadRequestException(
        "Failed to fetch recent transactions from blockchain",
      );
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
        { headers: form.getHeaders() },
      );

      return { success: true, imageUrl: response.data.secure_url };
    } catch (err: any) {
      throw new BadRequestException(
        err.response?.data || err.message || "Image upload failed",
      );
    }
  }
}
