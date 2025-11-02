import { type UserRequest } from "@/definitions";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BaseService } from "../../base.service";
import { User } from "../entities/user.entity";
import { ChangePinDto, ChangeUserPasswordDto, CreatePinDto } from "../dto";
import { hashResourceSync, verifyHash } from "@/core/utils";

@Injectable()
export class UsersService extends BaseService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
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
}
