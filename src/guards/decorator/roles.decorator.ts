import { AdministratorRoles } from "@/modules/administrator/entities/administrator.entity";
import { SetMetadata } from "@nestjs/common";

/**
 super_admin always passes and never needs
 * to be listed.
 for example, to allow marketers and support admins to access a route:
 *   @AllowRoles(AdministratorRoles.marketer, AdministratorRoles.support)
 */
export const ALLOW_ROLES = "allow_roles";
export const AllowRoles = (...roles: AdministratorRoles[]) =>
  SetMetadata(ALLOW_ROLES, roles);

//For self-service routes only (e.g. profile, change-password, logout)
export const ALLOW_ALL_ADMINS = "allow_all_admins";
export const AllowAllAdmins = () => SetMetadata(ALLOW_ALL_ADMINS, true);
