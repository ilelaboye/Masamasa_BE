import { Body, Controller, Get, Param, Post, UsePipes } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { AdminAuthService } from "../services/admin-auth.service";
import { AcceptStaffInviteDto } from "../dto/admin.dto";
import { AcceptStaffInviteValidation } from "../validations/admin.validation";

@ApiTags("Admin")
@Controller("admin/staff")
export class StaffInviteController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @ApiOperation({ summary: "use staff details to pre-fill registration" })
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
