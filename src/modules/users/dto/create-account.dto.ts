import { ApiProperty } from "@nestjs/swagger";
import { TokenType } from "../entities/user.entity";

export class CreateAccountDto {
  @ApiProperty({ example: "janet" })
  first_name: string;

  @ApiProperty({ example: "christmas" })
  last_name: string;

  @ApiProperty({ example: "ilelaboyealekan@gmail.com" })
  email: string;

  @ApiProperty({ example: "_Pa$$w0rd!XYZ" })
  password: string;

  @ApiProperty({ example: "_Pa$$w0rd!XYZ" })
  password_confirmation: string;

  @ApiProperty({ example: "+2349094749994" })
  phone: string;

  @ApiProperty({ example: "Nigeria" })
  country: string;
}

export class VerifyTokenDto {
  @ApiProperty({ example: "ilelaboyealekan@gmail.com" })
  email: string;

  @ApiProperty({ example: "123456" })
  token: string;

  @ApiProperty({ example: "email_verification" })
  type: TokenType;
}

export class LoginStaffDto {
  @ApiProperty({ example: "ilelaboyealekan@gmail.com" })
  email: string;

  @ApiProperty({ example: "123456" })
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: "ilelaboyealekan@gmail.com" })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: "ilelaboyealekan@gmail.com" })
  email: string;

  @ApiProperty({ example: "375930" })
  token: string;

  @ApiProperty({ example: "123Pas$Word!" })
  password: string;

  @ApiProperty({ example: "123Pas$Word!" })
  password_confirmation: string;
}

export class EditUserDto {
  @ApiProperty({ example: "Jennifer" })
  first_name: string;

  @ApiProperty({ example: "Roscoe" })
  last_name: string;

  @ApiProperty({ example: "+1-485-4944-009" })
  phone?: string;

  @ApiProperty({
    example: "312 Moshood Abiola Way Formerly Ikorodu Road, Lagos.",
  })
  address?: string;
}

export class ConfirmUserEmailDto {
  @ApiProperty({ example: "7413962428206334" })
  token: string;

  @ApiProperty({ example: "emmanuel.p@buysimply.app" })
  email: string;
}
