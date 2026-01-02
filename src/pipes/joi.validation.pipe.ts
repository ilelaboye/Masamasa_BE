import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ObjectSchema } from "joi";

@Injectable()
export class JoiValidationPipe implements PipeTransform {
  constructor(private schema: ObjectSchema) {}

  //eslint-disable-next-line
  transform(value: any, metadata: ArgumentMetadata) {
    if (value.content) value.content = JSON.parse(value.content);

    const { error } = this.schema.validate(value, { abortEarly: false });

    if (error) {
      const cause = error.details.map((detail) => ({
        name: detail.context?.key,
        message: detail.message.replace(/"/g, ""),
      }));
      throw new UnprocessableEntityException("Validation failed.", {
        cause,
        description: error.message,
      });
    }
    return value;
  }
}
