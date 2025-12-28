import { ApiProperty } from "@nestjs/swagger";

export class AdminLoginDto {
  @ApiProperty({ example: "lekan.i@buysimply.app" })
  email: string;

  @ApiProperty({ example: "_Pa$$w0rd!XYZ" })
  password: string;
}
