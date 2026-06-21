import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ethers } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";
import * as QRCode from "qrcode";

import { DisposableWallet, DisposableWalletStatus } from "../entity/disposable-wallet.entity";
import { 
  CreateDisposableWalletDto, 
  DisposableWalletResponseDto,
  CheckDisposableWalletDto,
  SweepDisposableWalletDto
} from "../dto/disposable-wallet.dto";
import { HDWallet } from "../hd-wallet";
import { SolHDWallet } from "../sol-hd-wallet";
import { TronHDWallet } from "../tron-hd-wallet";
import { CardanoHDWallet } from "../ada-hd-wallet";
import { BtcHDWallet } from "../btc-hd-wallet";
import { DogeHDWallet } from "../doge-hd-wallet";
import { XrpHDWallet } from "../xrp-hd-wallet";
import { PublicService } from "@/modules/global/public/public.service";
import { appConfig } from "@/config";
import { Wallet } from "@/modules/wallet/wallet.entity";
import { User } from "@/modules/users/entities/user.entity";

@Injectable()
export class DisposableWalletService {
  private hdEVM!: HDWallet;
  private hdSol: SolHDWallet;
  private hdTron: TronHDWallet;
  private hdADA: CardanoHDWallet;
  private hdBTC: BtcHDWallet;
  private hdDoge: DogeHDWallet;
  private hdXrp: XrpHDWallet;
  
  private providerBase: ethers.JsonRpcProvider;
  private providerETH: ethers.JsonRpcProvider;
  private providerBSC: ethers.JsonRpcProvider;
  private providerPoly: ethers.JsonRpcProvider;
  private connSol: Connection;

  // Starting index for disposable wallets (to avoid collision with regular wallets)
  private readonly DISPOSABLE_WALLET_START_INDEX = 1000000;

  constructor(
    @InjectRepository(DisposableWallet)
    private readonly disposableWalletRepository: Repository<DisposableWallet>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly publicService: PublicService,
  ) {
    // Initialize providers
    this.providerBase = new ethers.JsonRpcProvider(appConfig.BASE_RPC_URL);
    this.providerETH = new ethers.JsonRpcProvider(appConfig.ETH_RPC_URL);
    this.providerBSC = new ethers.JsonRpcProvider(appConfig.EVM_RPC_URL);
    
    const polygonNetwork = ethers.Network.from({ name: "matic", chainId: 137 });
    this.providerPoly = new ethers.JsonRpcProvider(appConfig.POLY_RPC_URL, polygonNetwork, {
      staticNetwork: polygonNetwork,
    });

    this.connSol = new Connection(appConfig.SOL_RPC_URL, "confirmed");

    // Initialize HD wallets
    this.hdSol = new SolHDWallet(appConfig.SOL_MASTER_MNEMONIC, this.publicService);
    this.hdTron = new TronHDWallet(appConfig.TRX_MASTER_MNEMONIC, "https://api.trongrid.io", this.publicService);
    this.hdADA = new CardanoHDWallet(appConfig.ADA_MASTER_MNEMONIC, this.publicService);
    this.hdBTC = new BtcHDWallet(appConfig.BTC_MASTER_MNEMONIC, false, this.publicService);
    this.hdDoge = new DogeHDWallet(appConfig.MASTER_MNEMONIC, false, this.publicService);
    this.hdXrp = new XrpHDWallet(appConfig.MASTER_MNEMONIC, this.publicService);

    this.initEVMWallet();
  }

  private async initEVMWallet() {
    if (!this.hdEVM) {
      this.hdEVM = await HDWallet.fromMnemonic(appConfig.MASTER_MNEMONIC, this.publicService);
    }
  }

  /**
   * Create a new disposable wallet
   */
  async createDisposableWallet(
    dto: CreateDisposableWalletDto,
    userId?: number
  ): Promise<DisposableWalletResponseDto> {
    await this.initEVMWallet();

    const network = dto.network.toUpperCase();
    const expirationMinutes = dto.expirationMinutes || 60;
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Get next available index
    const lastWallet = await this.disposableWalletRepository.findOne({
      where: { network },
      order: { derivation_index: "DESC" },
    });

    const derivationIndex = lastWallet 
      ? lastWallet.derivation_index + 1 
      : this.DISPOSABLE_WALLET_START_INDEX;

    let address: string;
    let destinationTag: number | undefined;

    // Generate address based on network
    switch (network) {
      case "BASE":
        address = this.hdEVM.getChildWallet(derivationIndex, this.providerBase).address;
        break;

      case "ETH":
      case "ETHEREUM":
        address = this.hdEVM.getChildWallet(derivationIndex, this.providerETH).address;
        break;

      case "BSC":
      case "BNB":
      case "BINANCE":
        address = this.hdEVM.getChildWallet(derivationIndex, this.providerBSC).address;
        break;

      case "POLYGON":
      case "MATIC":
        address = this.hdEVM.getChildWallet(derivationIndex, this.providerPoly).address;
        break;

      case "SOLANA":
      case "SOL":
        address = this.hdSol.deriveKeypair(derivationIndex).publicKey.toBase58();
        break;

      case "TRON":
      case "TRX":
        address = this.hdTron.getChildAddress(derivationIndex);
        break;

      case "CARDANO":
      case "ADA":
        address = this.hdADA.generateAddress(derivationIndex, true);
        break;

      case "BITCOIN":
      case "BTC":
        address = this.hdBTC.generateAddress(derivationIndex);
        break;

      case "RIPPLE":
      case "XRP":
        const xrpMasterAddress = await this.hdXrp.getMasterAddress();
        destinationTag = 44011 + derivationIndex;
        address = `${xrpMasterAddress}:${destinationTag}`;
        break;

      case "DOGE":
      case "DOGECOIN":
        address = this.hdDoge.generateAddress(derivationIndex);
        break;

      default:
        throw new BadRequestException(`Unsupported network: ${network}`);
    }

    // Save to disposable_wallet table
    const disposableWallet = this.disposableWalletRepository.create({
      user_id: userId,
      address,
      network,
      token_symbol: dto.tokenSymbol?.toUpperCase(),
      destination_tag: destinationTag,
      derivation_index: derivationIndex,
      expected_amount: dto.expectedAmount,
      expires_at: expiresAt,
      metadata: dto.metadata,
      status: DisposableWalletStatus.PENDING,
      received_amount: 0,
    });

    await this.disposableWalletRepository.save(disposableWallet);

    // Also save to main wallet table with expired_at set
    if (userId) {
      const walletEntry = this.walletRepository.create({
        user: { id: userId } as User,
        network,
        currency: dto.tokenSymbol?.toUpperCase() || this.getDefaultCurrency(network),
        wallet_address: address,
        expired_at: expiresAt, // Set expiration for disposable wallet (30 minutes)
      });

      await this.walletRepository.save(walletEntry);
    }

    // Generate QR code
    const qrData = this.formatAddressForQR(address, network, dto.tokenSymbol, dto.expectedAmount);
    const qrCode = await QRCode.toDataURL(qrData);

    return {
      address,
      network,
      tokenSymbol: dto.tokenSymbol?.toUpperCase(),
      destinationTag,
      expiresAt,
      qrCode,
      status: DisposableWalletStatus.PENDING,
      expectedAmount: dto.expectedAmount,
    };
  }

  /**
   * Check balance and status of disposable wallet
   */
  async checkDisposableWallet(dto: CheckDisposableWalletDto): Promise<any> {
    await this.initEVMWallet();

    const wallet = await this.disposableWalletRepository.findOne({
      where: { 
        address: dto.address,
        network: dto.network.toUpperCase(),
      },
    });

    if (!wallet) {
      throw new NotFoundException("Disposable wallet not found");
    }

    // Check if expired
    if (new Date() > wallet.expires_at && wallet.status === DisposableWalletStatus.PENDING) {
      wallet.status = DisposableWalletStatus.EXPIRED;
      await this.disposableWalletRepository.save(wallet);
    }

    // Get current balance
    const balance = await this.getBalance(
      wallet.address,
      wallet.network,
      wallet.derivation_index,
      wallet.token_symbol,
      wallet.destination_tag
    );

    // Update received amount if changed
    if (balance > 0 && balance !== Number(wallet.received_amount)) {
      wallet.received_amount = balance;
      
      if (wallet.status === DisposableWalletStatus.PENDING) {
        wallet.status = DisposableWalletStatus.FUNDED;
        wallet.funded_at = new Date();
      }
      
      await this.disposableWalletRepository.save(wallet);
    }

    return {
      address: wallet.address,
      network: wallet.network,
      tokenSymbol: wallet.token_symbol,
      destinationTag: wallet.destination_tag,
      balance,
      expectedAmount: wallet.expected_amount,
      receivedAmount: wallet.received_amount,
      status: wallet.status,
      expiresAt: wallet.expires_at,
      createdAt: wallet.created_at,
      fundedAt: wallet.funded_at,
      sweptAt: wallet.swept_at,
      sweepTxHash: wallet.sweep_tx_hash,
    };
  }

  /**
   * Manually sweep a disposable wallet
   */
  async sweepDisposableWallet(dto: SweepDisposableWalletDto): Promise<any> {
    await this.initEVMWallet();

    const wallet = await this.disposableWalletRepository.findOne({
      where: { 
        address: dto.address,
        network: dto.network.toUpperCase(),
      },
    });

    if (!wallet) {
      throw new NotFoundException("Disposable wallet not found");
    }

    if (wallet.status === DisposableWalletStatus.SWEPT) {
      throw new BadRequestException("Wallet already swept");
    }

    if (wallet.status === DisposableWalletStatus.EXPIRED) {
      throw new BadRequestException("Wallet expired");
    }

    // Perform sweep based on network
    const txHash = await this.performSweep(wallet);

    if (txHash) {
      wallet.status = DisposableWalletStatus.SWEPT;
      wallet.swept_at = new Date();
      wallet.sweep_tx_hash = txHash;
      await this.disposableWalletRepository.save(wallet);

      return {
        success: true,
        txHash,
        message: "Wallet swept successfully",
      };
    }

    throw new BadRequestException("Sweep failed - insufficient balance or network error");
  }

  /**
   * List all disposable wallets (with filters)
   */
  async listDisposableWallets(filters?: {
    status?: DisposableWalletStatus;
    network?: string;
    userId?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const query = this.disposableWalletRepository.createQueryBuilder("wallet");

    if (filters?.status) {
      query.andWhere("wallet.status = :status", { status: filters.status });
    }

    if (filters?.network) {
      query.andWhere("wallet.network = :network", { network: filters.network.toUpperCase() });
    }

    if (filters?.userId) {
      query.andWhere("wallet.user_id = :userId", { userId: filters.userId });
    }

    query
      .orderBy("wallet.created_at", "DESC")
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    const [wallets, total] = await query.getManyAndCount();

    return {
      data: wallets,
      total,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    };
  }

  /**
   * Get balance of a wallet based on network
   */
  private async getBalance(
    address: string,
    network: string,
    derivationIndex: number,
    tokenSymbol?: string,
    destinationTag?: number
  ): Promise<number> {
    const net = network.toUpperCase();

    try {
      switch (net) {
        case "BASE": {
          const wallet = this.hdEVM.getChildWallet(derivationIndex, this.providerBase);
          if (tokenSymbol) {
            const tokenAddress = this.getTokenAddress(net, tokenSymbol);
            return Number(await this.hdEVM.getERC20Balance(wallet.wallet, tokenAddress));
          }
          return Number(await this.hdEVM.getETHBalance(wallet.wallet));
        }

        case "ETH":
        case "ETHEREUM": {
          const wallet = this.hdEVM.getChildWallet(derivationIndex, this.providerETH);
          if (tokenSymbol) {
            const tokenAddress = this.getTokenAddress(net, tokenSymbol);
            return Number(await this.hdEVM.getERC20Balance(wallet.wallet, tokenAddress));
          }
          return Number(await this.hdEVM.getETHBalance(wallet.wallet));
        }

        case "BSC":
        case "BNB":
        case "BINANCE": {
          const wallet = this.hdEVM.getChildWallet(derivationIndex, this.providerBSC);
          if (tokenSymbol) {
            const tokenAddress = this.getTokenAddress("BNB", tokenSymbol);
            return Number(await this.hdEVM.getERC20Balance(wallet.wallet, tokenAddress));
          }
          return Number(await this.hdEVM.getETHBalance(wallet.wallet));
        }

        case "POLYGON":
        case "MATIC": {
          const wallet = this.hdEVM.getChildWallet(derivationIndex, this.providerPoly);
          if (tokenSymbol) {
            const tokenAddress = this.getTokenAddress("POLY", tokenSymbol);
            return Number(await this.hdEVM.getERC20Balance(wallet.wallet, tokenAddress));
          }
          return Number(await this.hdEVM.getETHBalance(wallet.wallet));
        }

        case "SOLANA":
        case "SOL": {
          if (tokenSymbol && tokenSymbol !== "SOL") {
            const tokenAddress = this.getTokenAddress("SOL", tokenSymbol);
            return await this.hdSol.getSPLTokenBalance(this.connSol, address, tokenAddress);
          }
          return await this.hdSol.getSolBalance(this.connSol, address);
        }

        case "BITCOIN":
        case "BTC":
          return await this.hdBTC.getBalance(address);

        case "CARDANO":
        case "ADA": {
          const balance = await this.hdADA.getChildBalance(derivationIndex, appConfig.BLOCK_API_KEY ?? "", true);
          return balance.lovelace;
        }

        case "RIPPLE":
        case "XRP": {
          const masterAddress = await this.hdXrp.getMasterAddress();
          return await this.hdXrp.getBalance(masterAddress);
        }

        case "DOGE":
        case "DOGECOIN":
          return await this.hdDoge.getBalance(address);

        case "TRON":
        case "TRX": {
          if (tokenSymbol && tokenSymbol !== "TRX") {
            const tokenAddress = this.getTokenAddress("TRON", tokenSymbol);
            const tronWeb = this.hdTron.getTronWebInstance();
            tronWeb.setAddress(address);
            const contract = await tronWeb.contract().at(tokenAddress);
            const balance = await contract.balanceOf(address).call({ from: address });
            return Number(balance) / 1e6;
          }
          const tronWeb = this.hdTron.getTronWebInstance();
          return (await tronWeb.trx.getBalance(address)) / 1e6;
        }

        default:
          return 0;
      }
    } catch (error) {
      console.error(`Failed to get balance for ${network}:`, error.message);
      return 0;
    }
  }

  /**
   * Perform sweep operation
   */
  private async performSweep(wallet: DisposableWallet): Promise<string | null> {
    const network = wallet.network.toUpperCase();
    const index = wallet.derivation_index;

    try {
      switch (network) {
        case "BASE": {
          const childWallet = this.hdEVM.getChildWallet(index, this.providerBase);
          const masterWallet = this.hdEVM.getMasterWallet(this.providerBase);
          
          if (wallet.token_symbol) {
            const tokenAddress = this.getTokenAddress(network, wallet.token_symbol);
            await this.hdEVM.sweepToken(childWallet, masterWallet, tokenAddress, "BASE", wallet.token_symbol);
          } else {
            await this.hdEVM.sweep(childWallet, masterWallet, "BASE", "ETH");
          }
          
          return "sweep_completed";
        }

        case "ETH":
        case "ETHEREUM": {
          const childWallet = this.hdEVM.getChildWallet(index, this.providerETH);
          const masterWallet = this.hdEVM.getMasterWallet(this.providerETH);
          
          if (wallet.token_symbol) {
            const tokenAddress = this.getTokenAddress("ETH", wallet.token_symbol);
            await this.hdEVM.sweepToken(childWallet, masterWallet, tokenAddress, "ETHEREUM", wallet.token_symbol);
          } else {
            await this.hdEVM.sweep(childWallet, masterWallet, "ETHEREUM", "ETH");
          }
          
          return "sweep_completed";
        }

        case "BSC":
        case "BNB":
        case "BINANCE": {
          const childWallet = this.hdEVM.getChildWallet(index, this.providerBSC);
          const masterWallet = this.hdEVM.getMasterWallet(this.providerBSC);
          
          if (wallet.token_symbol) {
            const tokenAddress = this.getTokenAddress("BNB", wallet.token_symbol);
            await this.hdEVM.sweepToken(childWallet, masterWallet, tokenAddress, "BINANCE CHAIN", wallet.token_symbol);
          } else {
            await this.hdEVM.sweep(childWallet, masterWallet, "BINANCE CHAIN", "BNB");
          }
          
          return "sweep_completed";
        }

        case "POLYGON":
        case "MATIC": {
          const childWallet = this.hdEVM.getChildWallet(index, this.providerPoly);
          const masterWallet = this.hdEVM.getMasterWallet(this.providerPoly);
          
          if (wallet.token_symbol) {
            const tokenAddress = this.getTokenAddress("POLY", wallet.token_symbol);
            await this.hdEVM.sweepToken(childWallet, masterWallet, tokenAddress, "POLYGON", wallet.token_symbol);
          } else {
            await this.hdEVM.sweep(childWallet, masterWallet, "POLYGON", "POL");
          }
          
          return "sweep_completed";
        }

        case "SOLANA":
        case "SOL": {
          const childKeypair = this.hdSol.deriveKeypair(index);
          const masterAddress = this.hdSol.getMasterKeypair().publicKey.toBase58();
          
          if (wallet.token_symbol && wallet.token_symbol !== "SOL") {
            const tokenAddress = this.getTokenAddress("SOL", wallet.token_symbol);
            await this.hdSol.sweepSPLToken(
              { privateKey: childKeypair.secretKey, address: childKeypair.publicKey.toBase58(), store: null },
              masterAddress,
              tokenAddress,
              this.connSol,
              index,
              wallet.token_symbol,
              this.hdSol.getMasterKeypair()
            );
          } else {
            const childKey = Buffer.from(childKeypair.secretKey).toString("hex");
            await this.hdSol.sweepSOL(
              { address: childKeypair.publicKey.toBase58(), privateKey: childKey },
              masterAddress,
              this.connSol,
              index
            );
          }
          
          return "sweep_completed";
        }

        case "BITCOIN":
        case "BTC": {
          const masterAddress = this.hdBTC.generateAddress(0);
          return await this.hdBTC.sweepBTC(index, masterAddress);
        }

        case "CARDANO":
        case "ADA": {
          const masterAddress = this.hdADA.generateAddress(0);
          return await this.hdADA.sweepADA(index, masterAddress, appConfig.BLOCK_API_KEY ?? "", true);
        }

        case "RIPPLE":
        case "XRP": {
          const masterWallet = await this.hdXrp.getMasterWallet();
          const swept = await this.hdXrp.sweepXRP(index, masterWallet.address);
          return swept ? "sweep_completed" : null;
        }

        case "DOGE":
        case "DOGECOIN": {
          const masterAddress = this.hdDoge.generateAddress(0);
          return await this.hdDoge.sweepDOGE(index, masterAddress);
        }

        case "TRON":
        case "TRX": {
          const childWallet = this.hdTron.deriveChild(index);
          const masterWallet = this.hdTron.getMasterWallet();
          
          if (wallet.token_symbol && wallet.token_symbol !== "TRX") {
            const tokenAddress = this.getTokenAddress("TRON", wallet.token_symbol);
            await this.hdTron.sweepTRC20(childWallet, masterWallet, "https://api.trongrid.io", tokenAddress, wallet.token_symbol);
          } else {
            await this.hdTron.sweepTRON(childWallet, masterWallet.address, "https://api.trongrid.io");
          }
          
          return "sweep_completed";
        }

        default:
          return null;
      }
    } catch (error) {
      console.error(`Sweep failed for ${network}:`, error.message);
      return null;
    }
  }

  /**
   * Auto-sweep cron job - runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoSweepFundedWallets() {
    console.log("Running auto-sweep for funded disposable wallets...");

    const fundedWallets = await this.disposableWalletRepository.find({
      where: { 
        status: DisposableWalletStatus.FUNDED 
      },
      take: 50, // Process 50 at a time
    });

    console.log(`Found ${fundedWallets.length} funded wallets to sweep`);

    for (const wallet of fundedWallets) {
      try {
        // Check if still has balance
        const balance = await this.getBalance(
          wallet.address,
          wallet.network,
          wallet.derivation_index,
          wallet.token_symbol,
          wallet.destination_tag
        );

        if (balance > 0) {
          const txHash = await this.performSweep(wallet);
          
          if (txHash) {
            wallet.status = DisposableWalletStatus.SWEPT;
            wallet.swept_at = new Date();
            wallet.sweep_tx_hash = txHash;
            await this.disposableWalletRepository.save(wallet);
            
            console.log(`✅ Swept ${wallet.network} wallet ${wallet.address}: ${txHash}`);
          }
        } else {
          console.log(`⚠️ Wallet ${wallet.address} has zero balance, skipping`);
        }
      } catch (error) {
        console.error(`❌ Failed to sweep ${wallet.address}:`, error.message);
        
        // Mark as failed after 3 attempts
        if (!wallet.metadata) wallet.metadata = {};
        wallet.metadata.sweep_attempts = (wallet.metadata.sweep_attempts || 0) + 1;
        
        if (wallet.metadata.sweep_attempts >= 3) {
          wallet.status = DisposableWalletStatus.FAILED;
        }
        
        await this.disposableWalletRepository.save(wallet);
      }
    }
  }

  /**
   * Expire old wallets - runs daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireOldWallets() {
    console.log("Expiring old disposable wallets...");

    await this.disposableWalletRepository.update(
      {
        status: DisposableWalletStatus.PENDING,
        expires_at: LessThan(new Date()),
      },
      {
        status: DisposableWalletStatus.EXPIRED,
      }
    );

    console.log("Expired wallets updated");
  }

  /**
   * Get token address from configuration
   */
  private getTokenAddress(network: string, symbol: string): string {
    const ERC20_TOKENS: Record<string, string> = {
      BASE_USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      BASE_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      BASE_BTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
      BASE_BNB: "0xf7158362807485ae32b6e0b40fd613c70629e9be",
      BNB_USDT: "0x55d398326f99059fF775485246999027B3197955",
      BNB_USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      BNB_ADA: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
      BNB_RIPPLE: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
      BNB_DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
      BNB_BTC: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      BNB_ETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      ETH_USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      ETH_USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      SOL_USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      SOL_USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      TRON_USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      POLY_USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      POLY_USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    };

    const key = `${network}_${symbol}`;
    if (!ERC20_TOKENS[key]) {
      throw new BadRequestException(`Token ${symbol} not supported on ${network}`);
    }

    return ERC20_TOKENS[key];
  }

  /**
   * Get default currency symbol for network
   */
  private getDefaultCurrency(network: string): string {
    const net = network.toUpperCase();
    
    switch (net) {
      case "BASE":
      case "ETH":
      case "ETHEREUM":
        return "ETH";
      case "BSC":
      case "BNB":
      case "BINANCE":
        return "BNB";
      case "POLYGON":
      case "MATIC":
        return "MATIC";
      case "SOLANA":
      case "SOL":
        return "SOL";
      case "TRON":
      case "TRX":
        return "TRX";
      case "CARDANO":
      case "ADA":
        return "ADA";
      case "BITCOIN":
      case "BTC":
        return "BTC";
      case "RIPPLE":
      case "XRP":
        return "XRP";
      case "DOGE":
      case "DOGECOIN":
        return "DOGE";
      default:
        return "UNKNOWN";
    }
  }

  /**
   * Format address for QR code
   */
  private formatAddressForQR(
    address: string,
    network: string,
    tokenSymbol?: string,
    amount?: number
  ): string {
    const net = network.toUpperCase();

    switch (net) {
      case "BITCOIN":
      case "BTC":
        return amount ? `bitcoin:${address}?amount=${amount}` : `bitcoin:${address}`;

      case "ETHEREUM":
      case "ETH":
        return amount ? `ethereum:${address}?value=${amount}` : `ethereum:${address}`;

      case "RIPPLE":
      case "XRP": {
        const [xrpAddress, tag] = address.split(":");
        return tag 
          ? `${xrpAddress}?dt=${tag}${amount ? `&amount=${amount}` : ""}`
          : xrpAddress;
      }

      default:
        return address;
    }
  }

  /**
   * Sweep all funded disposable wallets or a specific wallet
   * Simple trigger function like the regular wallet sweep
   */
  async sweepDisposableWallets(options?: {
    address?: string;
    network?: string;
    userId?: number;
  }): Promise<any> {
    await this.initEVMWallet();

    let walletsToSweep: DisposableWallet[] = [];

    // If specific address provided, sweep just that one
    if (options?.address && options?.network) {
      const wallet = await this.disposableWalletRepository.findOne({
        where: {
          address: options.address,
          network: options.network.toUpperCase(),
        },
      });

      if (!wallet) {
        throw new NotFoundException("Disposable wallet not found");
      }

      walletsToSweep = [wallet];
    } else {
      // Otherwise, sweep all funded wallets (not yet swept)
      const query = this.disposableWalletRepository.createQueryBuilder("wallet")
        .where("wallet.status = :status", { status: DisposableWalletStatus.FUNDED });

      if (options?.network) {
        query.andWhere("wallet.network = :network", { network: options.network.toUpperCase() });
      }

      if (options?.userId) {
        query.andWhere("wallet.user_id = :userId", { userId: options.userId });
      }

      walletsToSweep = await query.getMany();
    }

    const results = {
      total: walletsToSweep.length,
      success: 0,
      failed: 0,
      errors: [] as any[],
      swept: [] as any[],
    };

    for (const wallet of walletsToSweep) {
      try {
        // Skip if already swept or expired
        if (wallet.status === DisposableWalletStatus.SWEPT) {
          results.failed++;
          results.errors.push({
            address: wallet.address,
            network: wallet.network,
            error: "Already swept",
          });
          continue;
        }

        if (wallet.status === DisposableWalletStatus.EXPIRED) {
          results.failed++;
          results.errors.push({
            address: wallet.address,
            network: wallet.network,
            error: "Wallet expired",
          });
          continue;
        }

        // Perform sweep
        const txHash = await this.performSweep(wallet);

        if (txHash) {
          wallet.status = DisposableWalletStatus.SWEPT;
          wallet.swept_at = new Date();
          wallet.sweep_tx_hash = txHash;
          await this.disposableWalletRepository.save(wallet);

          results.success++;
          results.swept.push({
            address: wallet.address,
            network: wallet.network,
            txHash,
          });
        } else {
          results.failed++;
          results.errors.push({
            address: wallet.address,
            network: wallet.network,
            error: "Sweep failed - insufficient balance or network error",
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          address: wallet.address,
          network: wallet.network,
          error: error.message || "Unknown error",
        });
      }
    }

    return {
      message: `Swept ${results.success} of ${results.total} wallets`,
      ...results,
    };
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<any> {
    const [total, pending, funded, swept, expired, failed] = await Promise.all([
      this.disposableWalletRepository.count(),
      this.disposableWalletRepository.count({ where: { status: DisposableWalletStatus.PENDING } }),
      this.disposableWalletRepository.count({ where: { status: DisposableWalletStatus.FUNDED } }),
      this.disposableWalletRepository.count({ where: { status: DisposableWalletStatus.SWEPT } }),
      this.disposableWalletRepository.count({ where: { status: DisposableWalletStatus.EXPIRED } }),
      this.disposableWalletRepository.count({ where: { status: DisposableWalletStatus.FAILED } }),
    ]);

    return {
      total,
      byStatus: {
        pending,
        funded,
        swept,
        expired,
        failed,
      },
    };
  }
}
