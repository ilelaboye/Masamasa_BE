import { Body, Controller, Get, Param, Post, UsePipes } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { AdminAuthService } from "../services/admin-auth.service";
import { AcceptStaffInviteDto } from "../dto/admin.dto";
import { AcceptStaffInviteValidation } from "../validations/admin.validation";

/**
 * Staff invite acceptance — deliberately unguarded.
 *
 * An invitee has no session yet, so these two routes cannot sit on
 * AdministratorController, which guards every route on the class. The raw
 * invite token is the only credential, and it is single-use and time-limited.
 */
@ApiTags("Admin")
@Controller("admin/staff")
export class StaffInviteController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @ApiOperation({ summary: "Look up a staff invite to pre-fill registration" })
  @Get(":token/check")
  async checkInvite(@Param("token") token: string) {
    return this.adminAuthService.getInvite(token);
  }

  @ApiOperation({ summary: "Complete staff registration from an invite link" })
  @UsePipes(new JoiValidationPipe(AcceptStaffInviteValidation))
  @Post("accept-invite")
  async acceptInvite(@Body() acceptStaffInviteDto: AcceptStaffInviteDto) {
    return this.adminAuthService.acceptInvite(acceptStaffInviteDto);
  }
}
