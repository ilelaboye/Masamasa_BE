import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Transactions } from "./transactions.entity";

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionRepository: Repository<Transactions>
  ) {}

  async findAll(req: UserRequest) {
    return await this.transactionRepository.find({
      where: { user: { id: req.user.id } },
    });
  }
}
