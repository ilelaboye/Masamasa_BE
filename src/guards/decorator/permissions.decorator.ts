import { PermissionValueType } from '@/definitions';
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: PermissionValueType[]) => SetMetadata(PERMISSIONS_KEY, permissions);
