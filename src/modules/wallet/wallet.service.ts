import { UserRequest } from "@/definitions";
import { BadRequestException, Injectable } from "@nestjs/common";
import { CreateWalletDto } from "./wallet.dto";
import { Wallet } from "./wallet.entity";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async saveWalletAddress(createWalletDto: CreateWalletDto, req: UserRequest) {
    const existing = await this.walletRepository.exists({
      where: { wallet_address: createWalletDto.wallet_address },
    });
    if (existing) {
      throw new BadRequestException("Wallet address already exist");
    }
    const wallet = this.walletRepository.create({
      user: req.user,
      network: createWalletDto.network,
      currency: createWalletDto.currency,
      wallet_address: createWalletDto.wallet_address,
    });
    return await this.walletRepository.save(wallet);
  }

  async findAll(req: UserRequest) {
    return await this.walletRepository.find({
      where: { user: { id: req.user.id } },
    });
  }
}
