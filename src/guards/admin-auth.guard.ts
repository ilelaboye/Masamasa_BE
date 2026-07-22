import { appConfig } from "@/config";
import { _ADMIN_AUTH_COOKIE_NAME_ } from "@/constants";
import { extractAdminDataFromCookie } from "@/core/utils";
import { AdminStatus } from "@/modules/administrator/entities/administrator.entity";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private administratorService: AdministratorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    try {
      const { token } = extractAdminDataFromCookie(req);

      const payload = await this.jwtService.verifyAsync(token, {
        secret: appConfig.JWT_SECRET,
      });

      const details = await this.administratorService.getWithId(`${payload.id}`);
      if (!details) throw new UnauthorizedException("This account is not found!");
      if (details.status === AdminStatus.suspend)
        throw new ForbiddenException("This account has been suspended.");

      req["admin"] = details;
    } catch (e) {
      res.clearCookie(_ADMIN_AUTH_COOKIE_NAME_);
      if (e instanceof ForbiddenException) throw e;
      throw new UnauthorizedException(
        "Your session has expired, please login to continue",
      );
    }

    return true;
  }
}
