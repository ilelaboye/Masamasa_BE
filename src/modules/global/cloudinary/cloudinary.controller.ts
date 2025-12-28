import { successResponse } from "@/core/utils";
import {
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CloudinaryService } from "./cloudinary.service";

@ApiTags("Cloudinary Uploads")
@Controller("cloudinary")
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      required: ["file"],
      type: "object",
      properties: { file: { type: "file", required: ["true"] } },
    },
  })
  @UseInterceptors(FileInterceptor("file"))
  @Post("upload")
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Res() res: Response,
  ) {
    const data = await this.cloudinaryService.upload([file]);
    successResponse(res, { data: data[0] });
  }

  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      required: ["files"],
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { format: "binary", type: "file" },
          maxItems: 10,
          minItems: 1,
          nullable: false,
          description: "At least one binary file",
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor("files"))
  @Post("uploads")
  async uploads(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
      }),
    )
    files: Array<Express.Multer.File>,
    @Res() res: Response,
  ) {
    const data = await this.cloudinaryService.upload(files);
    successResponse(res, { data });
  }
}
