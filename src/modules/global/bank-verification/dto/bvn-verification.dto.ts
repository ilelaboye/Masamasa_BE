import { ApiProperty } from "@nestjs/swagger";

export class BVNUserDetailsDto {
  @ApiProperty({ example: "male" })
  gender: string;

  @ApiProperty({ example: new Date().toLocaleDateString() })
  dob: Date;
}

export class BVNUserDto extends BVNUserDetailsDto {
  first_name: string;
  last_name: string;
}

export class BVNVerificationDto {
  @ApiProperty({ example: "12345678900" })
  bvn: string;

  @ApiProperty({ example: "male" })
  gender: string;

  @ApiProperty({ example: new Date().toLocaleDateString() })
  dob: Date;
}
