import { ApiProperty } from '@nestjs/swagger';

export class ChangeUserPasswordDto {
  @ApiProperty({ example: '_Pa$$w0rd!XYZ' })
  old_password: string;

  @ApiProperty({ example: '_Pa$$w0rd!XYZ01' })
  new_password: string;

  @ApiProperty({ example: '_Pa$$w0rd!XYZ01' })
  new_password_confirmation?: string;
}
