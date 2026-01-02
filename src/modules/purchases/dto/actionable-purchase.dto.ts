import { ApiProperty } from "@nestjs/swagger";

export class ActionablePurchaseDto {
  @ApiProperty({
    example: [1, 2],
    description:
      "Give an array of purchases to (un)archive, if (un)archive one, put the single id in an array",
  })
  ids: Array<number>;
}
