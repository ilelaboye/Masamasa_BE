import { appConfig } from '@/config';
import { _ADMIN_AUTH_COOKIE_NAME_, _AUTH_COOKIE_NAME_ } from '@/constants';
import { extractAdminDataFromCookie, extractDataFromCookie } from '@/core/utils';
import { AdministratorService } from '@/modules/administrator/services/administrator.service';
import { CanActivate, ExecutionContext, Injectable, NotAcceptableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
      const { admin } = extractAdminDataFromCookie(req);
      const details = await this.administratorService.getWithId(`${admin.id}`);
      if (!details) throw new NotAcceptableException('This account is not found!');
      req['admin'] = admin;
    } catch {
      res.clearCookie(_ADMIN_AUTH_COOKIE_NAME_);
      throw new UnauthorizedException('Your session has expired, please login to continue');
    }

    return true;
  }
}
