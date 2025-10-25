import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UsersService } from "../services/users.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Staff Operations")
@Controller("staffs")
export class StaffsController {
  constructor(private readonly usersService: UsersService) {}

  @Get("account")
  async auth(@Req() req: UserRequest) {
    return await this.usersService.getAuthStaff(req);
  }
}
