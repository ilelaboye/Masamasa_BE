import { appConfig } from "@/config";
import { MAILJETTemplates } from "@/constants";
import { capitalizeString } from "@/core/helpers";
import { sendMailJetWithTemplate } from "@/core/utils";
import { User } from "@/modules/users/entities/user.entity";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}
}
