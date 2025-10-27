import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotAcceptableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Administrator, AdminStatus } from '../entities/administrator.entity';

@Injectable()
export class AdminLoginGuard implements CanActivate {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const { email } = request.body;

    const admin = await this.adminRepository.findOne({
      where: { email },
      select: ['id', 'first_name', 'last_name', 'email', 'phone', 'address', 'deleted_at', 'created_at', 'updated_at', 'password'],
    });

    if (!admin) throw new NotAcceptableException('Incorrect details given, please try again.');
    if (admin.status == AdminStatus.suspend) throw new ForbiddenException('This account has been suspended.');
    if (admin.deleted_at) throw new ForbiddenException('This account is no longer active.');

    request.admin = admin;
    return true;
  }
}
