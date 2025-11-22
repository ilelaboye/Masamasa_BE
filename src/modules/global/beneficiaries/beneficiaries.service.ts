import { Injectable } from '@nestjs/common';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  create(createBeneficiaryDto: CreateBeneficiaryDto) {
    console.log('D: ', createBeneficiaryDto);
  }

  update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    console.log('D: ', id, updateBeneficiaryDto);
  }

  delete(id: number) {
    return `This action removes a #${id} beneficiary`;
  }
}
