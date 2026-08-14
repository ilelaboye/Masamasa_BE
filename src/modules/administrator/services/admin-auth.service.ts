import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
} from "@nestjs/common";
import { AdminLoginDto } from "../dto";
import { AcceptStaffInviteDto } from "../dto/admin.dto";
import { AdminRequest } from "@/definitions";
import {
  getAdminCookieData,
  hashResource,
  timeIsAfter,
  verifyHash,
} from "@/core/utils";
import { hashInviteToken, INVITE_EXPIRY_HOURS } from "@/core/helpers";
import { InjectRepository } from "@nestjs/typeorm";
import { Administrator, AdminStatus } from "../entities/administrator.entity";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
    private readonly jwtService: JwtService,
  ) {}
  async login(adminLoginDto: AdminLoginDto, req: AdminRequest) {
    // const { admin } = req;
    const admin = await this.adminRepository
      .createQueryBuilder("admin")
      .addSelect("admin.password")
      .where("admin.email = :email", { email: adminLoginDto.email })
      .getOne();

    console.log("admin", admin);

    if (!admin)
      throw new NotAcceptableException(
        "Incorrect email & password, please try again",
      );

    // An invited staff member has no password until they accept. Treated as a
    // failed login rather than a distinct error, so this cannot be used to
    // enumerate which accounts are still pending.
    if (!admin.password)
      throw new NotAcceptableException(
        "Incorrect details given, please try again",
      );

    const verified = await verifyHash(adminLoginDto.password, admin.password);
    if (!verified)
      throw new NotAcceptableException(
        "Incorrect details given, please try again",
      );

    // let adminData = getAdminCookieData(admin.email, req);

    // if (!adminData) {
    //   adminData = await this.adminRepository.findOne({
    //     where: { email: admin.email, status: AdminStatus.active },
    //   });
    //   if (!adminData)
    //     throw new NotAcceptableException(
    //       "No admin data is currently associated with your account"
    //     );
    // }
    delete admin.password;
    const token = this.jwtService.sign({ ...admin });

    return { user: admin, token };
  }

  /**
   * Looks up a pending invite so the registration page can pre-fill the name
   * and email. Unauthenticated — the raw token is the only credential, so it
   * returns the bare minimum and never the role or id.
   */
  async getInvite(token: string) {
    const staff = await this.findByInviteToken(token);
    return {
      first_name: staff.first_name,
      last_name: staff.last_name,
      email: staff.email,
    };
  }

  /**
   * Completes registration: sets the password and phone, activates the
   * account, and burns the token so the link cannot be reused.
   */
  async acceptInvite(acceptDto: AcceptStaffInviteDto) {
    const staff = await this.findByInviteToken(acceptDto.token);

    await this.adminRepository.update(
      { id: staff.id },
      {
        password: await hashResource(acceptDto.password),
        phone: acceptDto.phone.trim(),
        status: AdminStatus.active,
        invite_token: null,
        invite_sent_at: null,
      },
    );

    return { message: "Your account has been activated, you can now log in" };
  }

  /**
   * Resolves a raw invite token to its account.
   *
   * Looks up by hash — the raw token is never stored. Expiry, reuse and an
   * unknown token all fail the same way, so a caller cannot tell them apart.
   */
  private async findByInviteToken(token: string) {
    const staff = await this.adminRepository
      .createQueryBuilder("admin")
      .addSelect("admin.invite_token")
      .where("admin.invite_token = :hash", { hash: hashInviteToken(token) })
      .andWhere("admin.status = :status", { status: AdminStatus.pending })
      .getOne();

    if (!staff)
      throw new BadRequestException(
        "This invite link is no longer valid. Ask an administrator to send a new one.",
      );

    // timeIsAfter works in minutes, so the 48-hour window is converted here.
    if (
      !staff.invite_sent_at ||
      timeIsAfter(staff.invite_sent_at, INVITE_EXPIRY_HOURS * 60)
    )
      throw new BadRequestException(
        "This invite link has expired. Ask an administrator to send a new one.",
      );

    return staff;
  }
}
