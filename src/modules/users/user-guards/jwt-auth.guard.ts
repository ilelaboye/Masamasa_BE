import { Global, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ExecutionContext } from "@nestjs/common/interfaces";
import { AuthGuard } from "@nestjs/passport";

@Global()
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  // eslint-disable-next-line
  handleRequest(err: unknown, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw new HttpException(
        {
          success: false,
          message: "unauthorized",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
