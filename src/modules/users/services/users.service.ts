import { type UserRequest } from "@/definitions";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BaseService } from "../../base.service";
import { User } from "../entities/user.entity";
import {
  ChangePinDto,
  ChangeUserPasswordDto,
  CreatePinDto,
  TransferDto,
  WithdrawalDto,
} from "../dto";
import { hashResourceSync, verifyHash } from "@/core/utils";
import { TransactionService } from "@/modules/transactions/transactions.service";
import {
  TransactionEntityType,
  TransactionModeType,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { Transfer } from "@/modules/transfers/transfers.entity";
import { generateMasamasaRef } from "@/core/helpers";

@Injectable()
export class UsersService extends BaseService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transfer)
    private readonly transferRepository: Repository<Transfer>,
    private readonly transactionService: TransactionService
  ) {
    super();
  }
  async getAuthStaff(req: UserRequest) {
    return req.user;
  }

  async setPin(createPinDto: CreatePinDto, req: UserRequest) {
    if (!createPinDto.pin || !/^\d{4}$/.test(createPinDto.pin)) {
      throw new BadRequestException("Invalid pin, pin must be 4-digit");
    }
    const { user } = req;

    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :id", { id: user.id })
      .getOne();

    if (fetch && fetch.pin) {
      throw new BadRequestException(
        "Pin has already been set, please click on change pin to proceed"
      );
    }

    const save = await this.userRepository.update(
      { id: user.id },
      { pin: hashResourceSync(`${createPinDto.pin}`) }
    );

    return user;
  }

  async changePin(changePinDto: ChangePinDto, req: UserRequest) {
    const { user } = req;
    if (!changePinDto.old_pin) {
      throw new BadRequestException("Old pin is required");
    }
    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :id", { id: user.id })
      .getOne();
    if (fetch) {
      const verified = await verifyHash(changePinDto.old_pin, fetch.pin);
      if (!verified) throw new BadRequestException("Incorrect old pin");
    }

    if (!changePinDto.pin || !/^\d{4}$/.test(changePinDto.pin)) {
      throw new BadRequestException("Invalid new pin, pin must be 4-digit");
    }

    const save = await this.userRepository.update(
      { id: user.id },
      { pin: hashResourceSync(`${changePinDto.pin}`) }
    );

    return user;
  }

  async changePassword(
    changeUserPasswordDto: ChangeUserPasswordDto,
    req: UserRequest
  ) {
    const user = await this.userRepository.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new BadRequestException("User not found, please login again");
    }

    const verified = await verifyHash(
      changeUserPasswordDto.old_password,
      user.password
    );
    if (!verified) throw new BadRequestException("Incorrect current password");

    if (
      changeUserPasswordDto.new_password !=
      changeUserPasswordDto.new_password_confirmation
    ) {
      throw new BadRequestException(
        "New password and confirm password does not match"
      );
    }

    const saved = this.userRepository.update(
      { email: user.email },
      { password: changeUserPasswordDto.new_password }
    );
    return saved;
  }

  async walletBalance(req: UserRequest) {
    return this.transactionService.getAccountBalance(req);
  }

  async transfer(transferDto: TransferDto, req: UserRequest) {
    const find = await this.userRepository.findOne({
      where: { email: transferDto.email },
    });
    if (!find) {
      throw new BadRequestException("User with this email was not found");
    }
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :user_id", { user_id: req.user.id })
      .getOne();
    if (!user) {
      throw new UnauthorizedException(
        "Auth user not found, please login again"
      );
    }
    if (user.id == find.id) {
      throw new UnauthorizedException("You can't transfer to yourself");
    }
    const balance = await this.transactionService.getAccountBalance(req);
    if (balance < transferDto.amount) {
      throw new BadRequestException("Insufficient wallet balance");
    }
    const verified = await verifyHash(transferDto.pin, user.pin);
    if (!verified) throw new BadRequestException("Incorrect pin");

    delete user.pin;
    delete user.pin;

    const transfer = await this.transferRepository.save({
      user_id: user.id,
      receiver_id: find.id,
      amount: transferDto.amount,
    });

    const trans = await this.transactionService.saveTransaction({
      user_id: user.id,
      network: null,
      coin_amount: 0,
      wallet_address: null,
      mode: TransactionModeType.debit,
      entity_type: TransactionEntityType.transfer,
      metadata: {
        receiver: {
          id: find.id,
          first_name: find.first_name,
          last_name: find.last_name,
          email: find.email,
        },
      },
      exchange_rate_id: null,
      currency: "NGN",
      entity_id: transfer.id,
      dollar_amount: 0,
      amount: transferDto.amount,
      coin_exchange_rate: 0,
    });

    const credit_trans = await this.transactionService.saveTransaction({
      user_id: find.id,
      network: null,
      coin_amount: 0,
      wallet_address: null,
      mode: TransactionModeType.credit,
      entity_type: TransactionEntityType.transfer,
      metadata: {
        sender: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
        },
      },
      exchange_rate_id: null,
      currency: "NGN",
      entity_id: transfer.id,
      dollar_amount: 0,
      amount: transferDto.amount,
      coin_exchange_rate: 0,
    });

    return trans;
  }

  async withdrawal(withdrawalDto: WithdrawalDto, req: UserRequest) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :user_id", { user_id: req.user.id })
      .getOne();
    if (!user) {
      throw new UnauthorizedException(
        "Auth user not found, please login again"
      );
    }
    const balance = await this.transactionService.getAccountBalance(req);
    if (balance < withdrawalDto.amount) {
      throw new BadRequestException("Insufficient wallet balance");
    }
    const verified = await verifyHash(withdrawalDto.pin, user.pin);
    if (!verified) throw new BadRequestException("Incorrect pin");

    delete user.pin;

    const trans = await this.transactionService.saveTransaction({
      user_id: user.id,
      network: null,
      coin_amount: 0,
      wallet_address: null,
      mode: TransactionModeType.debit,
      entity_type: TransactionEntityType.withdrawal,
      metadata: {
        bankCode: withdrawalDto.bankCode,
        accountNumber: withdrawalDto.accountNumber,
        accountName: withdrawalDto.accountName,
        bankName: withdrawalDto.bankName,
      },
      exchange_rate_id: null,
      currency: "NGN",
      entity_id: 0,
      dollar_amount: 0,
      amount: withdrawalDto.amount,
      coin_exchange_rate: 0,
      status: TransactionStatusType.processing,
    });

    return trans;
  }
}
