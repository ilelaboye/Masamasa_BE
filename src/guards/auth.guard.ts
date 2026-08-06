import { appConfig } from "@/config";
import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { extractDataFromCookie } from "@/core/utils";
import { Status, User } from "@/modules/users/entities/user.entity";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotAcceptableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

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

    // Deactivated users are cut off on every request — the cleared cookie
    // plus the 401 forces the app to log them out.
    const dbUser = await this.dataSource.getRepository(User).findOne({
      where: { id: req.user.id },
      select: ["id", "status", "last_seen_at"],
    });
    if (!dbUser || dbUser.status === Status.deactivated) {
      res.clearCookie(_AUTH_COOKIE_NAME_);
      throw new UnauthorizedException(
        "Your account has been deactivated. Please reach out to the admin to be activated.",
      );
    }

    // Activity tracking for daily-active-user analytics. Throttled to one
    // write per 15 minutes per user; fire-and-forget so it never slows or
    // fails the request.
    const staleAfterMs = 15 * 60 * 1000;
    if (
      !dbUser.last_seen_at ||
      Date.now() - new Date(dbUser.last_seen_at).getTime() > staleAfterMs
    ) {
      this.dataSource
        .getRepository(User)
        .update({ id: dbUser.id }, { last_seen_at: new Date() })
        .catch(() => {});
    }

    return true;
  }
}
