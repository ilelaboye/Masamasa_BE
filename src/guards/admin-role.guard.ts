import { AdministratorRoles } from "@/modules/administrator/entities/administrator.entity";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ALLOW_ALL_ADMINS, ALLOW_ROLES } from "./decorator/roles.decorator";

// Role gate for the admin API. super_admin roles sees everything but Every other role can not see everything unless thier permissions are listed in the handler lists in @AllowRoles().

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { admin } = context.switchToHttp().getRequest();

    if (!admin)
      throw new UnauthorizedException(
        "Your session has expired, please login to continue",
      );

    if (admin.role === AdministratorRoles.super_admin) return true;

    const anyAdmin = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ALL_ADMINS,
      [context.getHandler(), context.getClass()],
    );
    if (anyAdmin) return true;

    const allowed = this.reflector.getAllAndOverride<AdministratorRoles[]>(
      ALLOW_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (allowed?.includes(admin.role)) return true;

    throw new ForbiddenException(
      "You do not have permission to perform this action",
    );
  }
}
