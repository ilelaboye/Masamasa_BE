import { appConfig } from "@/config";
import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { extractDataFromCookie } from "@/core/utils";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotAcceptableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    try {
      const { user, token } = extractDataFromCookie(req);
      const payload = await this.jwtService.verifyAsync(token, {
        secret: appConfig.JWT_SECRET,
      });

      console.log("Payload", payload);

      req["user"] = payload;
    } catch {
      res.clearCookie(_AUTH_COOKIE_NAME_);
      throw new UnauthorizedException(
        "Your session has expired, please login to continue"
      );
    }

    return true;
  }
}
