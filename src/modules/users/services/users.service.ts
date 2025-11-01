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
import { ChangeUserPasswordDto, CreatePinDto } from "../dto";
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
    console.log("pin", createPinDto.pin);
    if (!createPinDto.pin || !isNaN(createPinDto.pin)) {
      throw new BadRequestException("Invalid pin");
    }
    const { user } = req;

    const save = await this.userRepository.update(
      { id: user.id },
      { pin: hashResourceSync(`${createPinDto.pin}`) }
    );

    return save;
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
