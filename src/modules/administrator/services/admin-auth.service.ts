import { Injectable, NotAcceptableException } from '@nestjs/common';
import { AdminLoginDto } from '../dto';
import { AdminRequest } from '@/definitions';
import { getAdminCookieData, verifyHash } from '@/core/utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Administrator, AdminStatus } from '../entities/administrator.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
    private readonly jwtService: JwtService,
  ) {}
  async login(adminLoginDto: AdminLoginDto, req: AdminRequest) {
    const { admin } = req;
    const verified = await verifyHash(adminLoginDto.password, admin.password);
    if (!verified) throw new NotAcceptableException('Incorrect details given, please try again');

    let adminData = getAdminCookieData(admin.email, req);

    if (!adminData) {
      adminData = await this.adminRepository.findOne({
        where: { email: admin.email, status: AdminStatus.active },
        relations: ['permissions'],
      });
      if (!adminData) throw new NotAcceptableException('No admin data is currently associated with your account');
    }
    delete admin.password;
    const token = this.jwtService.sign({ ...admin });

    return { user: adminData, token };
  }
}
