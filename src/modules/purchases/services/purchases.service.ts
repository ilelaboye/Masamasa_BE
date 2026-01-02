import { generateMasamasaRef, paginate } from "@/core/helpers";
import {
  endOfDay,
  generateVtpassRequestId,
  getRequestQuery,
} from "@/core/utils";
import { UserRequest } from "@/definitions";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import {
  IElectricityPurchaseDto,
  PurchaseRequestItemDto,
} from "../dto/purchase.dto";
import {
  PurchaseRequest,
  PurchaseStatus,
  PurchaseType,
} from "../entities/purchases.entity";

import { CacheService } from "@/modules/global/cache-container/cache-container.service";

import { ProviderService } from "./providers.service";
import { appConfig } from "@/config";
import { UsersService } from "@/modules/users/services/users.service";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRepository: Repository<PurchaseRequest>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly providerService: ProviderService,
    private readonly usersService: UsersService,
  ) {}

  async createAirtime(
    createAirtimePurchaseDto: PurchaseRequestItemDto,
    req: UserRequest,
  ) {
    const wallet = await this.usersService.walletBalance(req);
    if (wallet < createAirtimePurchaseDto.amount) {
      throw new BadRequestException("Insufficient wallet balance");
    }
    const requestId = generateVtpassRequestId(req.user.id);
    console.log("requestId", requestId);
    const { amount, network, recipient_name, phone_number } =
      createAirtimePurchaseDto;
    const purchaseRequest = {
      amount: amount,
      type: PurchaseType.airtime,
      provider: network,
      fee: 0,
      total: amount,
      recipient_name,
      status: PurchaseStatus.pending,
      user: { id: req.user.id },
      masamasa_ref: requestId,
      metadata: {
        phone: phone_number,
      },
    } as PurchaseRequest;
    const createdPurchaseRequests: PurchaseRequest =
      await this.purchaseRepository.save(purchaseRequest);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const resp = await this.providerService.processAirtimePurchase(
        createdPurchaseRequests,
        requestId,
      );
      if (!resp.status) {
        throw new BadRequestException(resp.message);
      }
      console.log("createdPurchaseRequests", createdPurchaseRequests);
      if (resp.data.content.transactions.status != "delivered") {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processing,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
      } else {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processed,
            commission: resp.data.content.transactions.commission,
            other_ref: resp.data.content.transactions.transactionId,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
        await queryRunner.manager.save(Transactions, {
          user_id: req.user.id,
          coin_amount: 0,
          mode: TransactionModeType.debit,
          entity_type: TransactionEntityType.airtime,
          metadata: {
            vtpass_response: resp.data,
            provider: network,
            phone: phone_number,
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: createdPurchaseRequests.id,
          amount: amount,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        });
      }
      await queryRunner.commitTransaction();
      return createdPurchaseRequests;
    } catch (error) {
      console.log("error", error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async createData(
    createDataPurchaseDto: PurchaseRequestItemDto,
    req: UserRequest,
  ) {
    const {
      amount,
      network,
      recipient_name,
      phone_number,
      product_name,
      variation_code,
    } = createDataPurchaseDto;

    let variationList: any = await this.cacheService.get(
      `vtpass_variation_${network}`,
    );
    console.log("variationList", variationList);
    if (!variationList) {
      variationList = await this.providerService.getServiceVariation(network);
    }
    const variation = variationList.variations.find(
      (item) => item.variation_code == variation_code,
    );
    if (!variation) {
      throw new BadRequestException("Data selected is currently not available");
    }

    const wallet = await this.usersService.walletBalance(req);
    if (wallet < variation.variation_amount) {
      throw new BadRequestException("Insufficient wallet balance");
    }

    const requestId = generateVtpassRequestId(req.user.id);
    const purchaseRequest = {
      amount: variation.variation_amount,
      type: PurchaseType.data,
      provider: network, // serviceID
      recipient_name,
      fee: 0,
      total: variation.variation_amount,
      status: PurchaseStatus.pending,
      user: { id: req.user.id },
      masamasa_ref: requestId,
      metadata: {
        phone: phone_number,
        product_name,
        variation_code,
      },
    } as PurchaseRequest;
    const createdPurchaseRequests: PurchaseRequest =
      await this.purchaseRepository.save(purchaseRequest);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const resp = await this.providerService.processDataPurchase(
        createdPurchaseRequests,
        requestId,
      );
      console.log("resp", resp);
      if (!resp.status) {
        throw new BadRequestException(resp.message);
      }

      if (
        resp.data.content &&
        resp.data.content.transactions &&
        resp.data.content.transactions.status == "delivered"
      ) {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processed,
            commission: resp.data.content.transactions.commission,
            other_ref: resp.data.content.transactions.transactionId,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
        await queryRunner.manager.save(Transactions, {
          user_id: req.user.id,
          coin_amount: 0,
          mode: TransactionModeType.debit,
          entity_type: TransactionEntityType.data,
          metadata: {
            vtpass_response: resp.data,
            provider: network,
            phone: phone_number,
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: createdPurchaseRequests.id,
          amount: amount,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        });
      } else {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processing,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
      }

      await queryRunner.commitTransaction();
      return createdPurchaseRequests;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async createElectricity(
    electricityPurchaseDto: IElectricityPurchaseDto,
    req: UserRequest,
  ) {
    const {
      amount,
      meter_no,
      recipient_name,
      phone_number,
      serviceID,
      meter_type,
    } = electricityPurchaseDto;

    const total =
      parseFloat(`${appConfig.VTPASS_ELECTRICITY_FEE}`) +
      parseFloat(`${amount}`);
    const requestId = generateVtpassRequestId(req.user.id);
    const purchaseRequest = {
      amount: amount,
      type: PurchaseType.electricity_bill,
      provider: serviceID, // serviceID
      status: PurchaseStatus.pending,
      user: { id: req.user.id },
      recipient_name,
      fee: appConfig.VTPASS_ELECTRICITY_FEE,
      total: total,
      masamasa_ref: requestId,
      metadata: {
        phone: phone_number,
        meter_no,
        meter_type,
      },
    } as unknown as PurchaseRequest;

    const createdPurchaseRequests: PurchaseRequest =
      await this.purchaseRepository.save(purchaseRequest);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const resp = await this.providerService.processElectricityPurchase(
        createdPurchaseRequests,
        requestId,
        req.user,
      );
      if (!resp.status) {
        throw new BadRequestException(resp.message);
      }

      if (resp.data.content.transactions.status != "delivered") {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processing,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
      } else {
        await queryRunner.manager.update(
          PurchaseRequest,
          { id: createdPurchaseRequests.id },
          {
            status: PurchaseStatus.processed,
            commission: resp.data.content.transactions.commission,
            other_ref: resp.data.content.transactions.transactionId,
            metadata: {
              ...createdPurchaseRequests.metadata,
              provider_response: resp.data,
            },
          },
        );
        await queryRunner.manager.save(Transactions, {
          user_id: req.user.id,
          coin_amount: 0,
          mode: TransactionModeType.debit,
          entity_type: TransactionEntityType.electricity_bill,
          metadata: {
            vtpass_response: resp.data,
            phone: phone_number,
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: createdPurchaseRequests.id,
          amount: amount,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        });
      }
      await queryRunner.commitTransaction();
      return createdPurchaseRequests;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async findAll(req: UserRequest) {
    const { limit, status, page, skip, type, date_from, date_to } =
      getRequestQuery(req);

    let count = 0;
    const purchaseRequests: PurchaseRequest[] = [];
    let requests;

    let queryRunner = this.purchaseRepository
      .createQueryBuilder("purchases")
      .where("purchases.user_id = :userId", { userId: req.user.id });

    if (status && Object.keys(PurchaseStatus).includes(status.toLowerCase()))
      queryRunner = queryRunner.andWhere("purchases.status = :status", {
        status,
      });

    if (type)
      queryRunner = queryRunner.andWhere("purchases.type = :type", { type });
    if (date_from) {
      queryRunner = queryRunner.andWhere(
        "purchases.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: new Date().toISOString(),
        },
      );
    }
    if (date_to) {
      queryRunner = queryRunner.andWhere(
        "purchases.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(1970).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }
    if (date_from && date_to) {
      queryRunner = queryRunner.andWhere(
        "purchases.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }

    queryRunner = queryRunner.orderBy("purchases.created_at", "DESC");
    count = await queryRunner.getCount();
    requests = await queryRunner
      .skip(skip)
      .take(limit)
      .select([
        "purchases.id",
        "purchases.amount",
        "purchases.total",
        "purchases.fee",
        "purchases.status",
        "purchases.due_at",
        "purchases.metadata",
        "purchases.recipient_name",
        "purchases.type",
        "purchases.provider",
        "purchases.created_at",
      ])
      .withDeleted()
      .getMany();
    purchaseRequests.push(...requests);
    const metadata = paginate(count, page, limit);
    return { purchaseRequests, metadata };
  }

  async findOne(id: number, req: UserRequest, withRequestQueue = false) {
    const purchase = await this.purchaseRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!purchase)
      throw new NotFoundException("Purchase request with this ID not found");

    return purchase;
  }
}
