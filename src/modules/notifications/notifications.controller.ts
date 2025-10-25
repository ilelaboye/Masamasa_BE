import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@ApiTags("Notifications")
@UseGuards(AuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@Req() req: UserRequest) {
    return await this.notificationsService.findAll(req.user.id);
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: UserRequest) {
    return await this.notificationsService.findOne(+id, req);
  }
}
