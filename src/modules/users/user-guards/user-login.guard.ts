import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotAcceptableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";

@Injectable()
export class UserLoginGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const { email } = request.body;

    const user = await this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      select: [
        "id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "address",
        "email_verified_at",
        "deleted_at",
        "created_at",
        "updated_at",
        "password",
      ],
    });

    if (!user)
      throw new NotAcceptableException(
        "Incorrect details given, please try again.",
      );
    if (user.deleted_at)
      throw new ForbiddenException("This account is no longer active.");

    request.user = user;
    return true;
  }
}
