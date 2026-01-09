import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PurchaseRequest, PurchaseStatus } from "../entities/purchases.entity";
import { axiosClient } from "@/core/utils";
import { appConfig } from "@/config";
import { VTPassResponse, VTPassServiceListResponse } from "@/definitions";
// import { generateVtpassRequestId } from "@/core/helpers/general";
import { ValidateMeterNoDto } from "../dto/purchase.dto";
import axios from "axios";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { User } from "@/modules/users/entities/user.entity";

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRepository: Repository<PurchaseRequest>,
    private readonly cacheService: CacheService,
  ) {}

  async getServiceList() {
    try {
      const cachedData = await this.cacheService.get<
        VTPassServiceListResponse | undefined
      >(`vtpass_service_list`);
      if (cachedData) return cachedData;

      const res: VTPassServiceListResponse =
        await axiosClient<VTPassServiceListResponse>(
          `${appConfig.VTPASS_URL}/service-categories`,
          {
            method: "GET",
          },
        );

      const providers = res.content.filter(
        (provider) =>
          provider.identifier.toLowerCase() !== "education" &&
          provider.identifier.toLowerCase() !== "other-services" &&
          provider.identifier.toLowerCase() !== "insurance" &&
          provider.identifier.toLowerCase() !== "tv-subscription",
      );

      this.cacheService.set(`vtpass_service_list`, providers);
      return providers;
    } catch (e) {
      console.error("Error fetching service list:", e);
      throw new BadRequestException("Error fetching service list from Vtpass");
    }
  }

  async getServiceByID(serviceID: string) {
    try {
      const cachedData = await this.cacheService.get<
        VTPassServiceListResponse | undefined
      >(`vtpass_service_${serviceID}`);
      if (cachedData) return cachedData;

      const res: VTPassServiceListResponse =
        await axiosClient<VTPassServiceListResponse>(
          `${appConfig.VTPASS_URL}/services?identifier=${serviceID}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );

      if (serviceID === "airtime") {
        return res.content.filter(
          (provider) => provider.serviceID !== "foreign-airtime",
        );
      } else if (serviceID === "data") {
        return res.content.filter(
          (provider) => provider.serviceID !== "foreign-data",
        );
      }

      this.cacheService.set(`vtpass_service_${serviceID}`, res.content);
      return res.content;
    } catch (e) {
      throw e;
    }
  }

  async getServiceVariation(serviceID: string) {
    try {
      const cachedData = await this.cacheService.get<
        VTPassServiceListResponse | undefined
      >(`vtpass_variation_${serviceID}`);
      if (cachedData) return cachedData;

      const res: VTPassServiceListResponse =
        await axiosClient<VTPassServiceListResponse>(
          `${appConfig.VTPASS_URL}/service-variations?serviceID=${serviceID}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );
      this.cacheService.set(`vtpass_variation_${serviceID}`, res.content);
      return res.content;
    } catch (e) {
      throw e;
    }
  }

  async validateMeterNumber(validateMeterNoDto: ValidateMeterNoDto) {
    const token = Buffer.from(
      `${appConfig.VTPASS_USERNAME}:${appConfig.VTPASS_PASSWORD}`,
    ).toString("base64");
    try {
      const res = await axiosClient<VTPassResponse>(
        `${appConfig.VTPASS_URL}/merchant-verify`,
        {
          method: "POST",
          body: {
            billersCode: validateMeterNoDto.meter_no,
            serviceID: validateMeterNoDto.serviceID,
            type: validateMeterNoDto.meter_type,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": appConfig.VTPASS_API_KEY,
            "secret-key": appConfig.VTPASS_SECRET_KEY,
          },
        },
      );
      const handler = this.vtpassErrorHandler(res.code, res);
      if (!handler.status) {
        throw new BadRequestException(handler.message);
      }
      return res.content;
    } catch (e) {
      console.log("Error processing fetching utility information:", e);
      // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }

  async processAirtimePurchase(purchase: PurchaseRequest, requestId: string) {
    try {
      const res = await axiosClient<VTPassResponse>(
        `${appConfig.VTPASS_URL}/pay`,
        {
          method: "POST",
          body: {
            request_id: requestId,
            serviceID: purchase.provider,
            amount: purchase.amount,
            phone: purchase.metadata?.phone,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": appConfig.VTPASS_API_KEY,
            "secret-key": appConfig.VTPASS_SECRET_KEY,
          },
        },
      );
      console.log("airtime purchase response", res);
      const handler = this.vtpassErrorHandler(res.code, res);
      console.log("handler", handler);
      if (!handler.status) {
        this.purchaseRepository.update(
          { id: purchase.id },
          { metadata: { ...purchase.metadata, error: handler.message } },
        );
        return { status: false, message: handler.message };
      } else {
        return { status: true, data: res };
      }
    } catch (e) {
      console.log("Error processing data purchase:", e);
      // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }

  async processDataPurchase(purchase: PurchaseRequest, requestId: string) {
    try {
      const res = await axiosClient<VTPassResponse>(
        `${appConfig.VTPASS_URL}/pay`,
        {
          method: "POST",
          body: {
            request_id: requestId,
            serviceID: purchase.provider,
            amount: purchase.amount,
            phone: purchase.metadata?.phone,
            billersCode: purchase.metadata?.phone,
            variation_code: purchase.metadata?.variation_code,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": appConfig.VTPASS_API_KEY,
            "secret-key": appConfig.VTPASS_SECRET_KEY,
          },
        },
      );
      console.log("data purchase response", res);
      const handler = this.vtpassErrorHandler(res.code, res);

      if (!handler.status) {
        // throw new BadRequestException(handler.message);
        this.purchaseRepository.update(
          { id: purchase.id },
          { metadata: { ...purchase.metadata, error: handler.message } },
        );
        return { status: false, message: handler.message };
      } else {
        return { status: true, data: res };
      }

      // if (
      //   res.content &&
      //   res.content.transactions &&
      //   res.content.transactions.status == "delivered"
      // ) {
      //   this.purchaseRepository.update(
      //     { id: purchase.id },
      //     {
      //       status: PurchaseStatus.processed,
      //       commission: res.content.transactions.commission,
      //       other_ref: res.content.transactions.transactionId,
      //       metadata: { ...purchase.metadata, provider_response: res },
      //     }
      //   );
      //   return { status: true, data: res };
      // } else {
      //   // update the metadata if the request is still processing
      //   this.purchaseRepository.update(
      //     { id: purchase.id },
      //     {
      //       metadata: { ...purchase.metadata, provider_response: res },
      //     }
      //   );
      //   return { status: false, message: res.content.error };
      // }
    } catch (e) {
      console.log("Error processing data purchase:", e);
      // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }

  async processElectricityPurchase(
    purchase: PurchaseRequest,
    requestId: string,
    user: User,
  ) {
    try {
      const res = await axiosClient<VTPassResponse>(
        `${appConfig.VTPASS_URL}/pay`,
        {
          method: "POST",
          body: {
            request_id: requestId,
            serviceID: purchase.provider,
            amount: purchase.amount,
            phone: purchase.metadata?.phone,
            billersCode: purchase.metadata?.meter_no,
            variation_code: purchase.metadata?.meter_type,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": appConfig.VTPASS_API_KEY,
            "secret-key": appConfig.VTPASS_SECRET_KEY,
          },
        },
      );
      console.log("electricity purchase response", res);
      const handler = this.vtpassErrorHandler(res.code, res);
      if (!handler.status) {
        // throw new BadRequestException(handler.message);
        this.purchaseRepository.update(
          { id: purchase.id },
          { metadata: { ...purchase.metadata, error: handler.message } },
        );
        return { status: false, message: handler.message };
      } else {
        const token = res.purchased_code
          .replace(/\D+/gm, "")
          .replace(/(.{4})/g, "$1");
        const sms = `Electricity Update \n${user.first_name.substring(0, 30)} bought you ${res.units} of electricty.\nToken: ${token}\n Powered by MasaMasa`;

        // sendTermiiSMS(sms, purchase.metadata.phone, "N-Alert");

        return { status: true, data: { ...res, token } };
      }
    } catch (e) {
      console.log("Error processing data purchase:", e);
      // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }

  async verifyVtpassTransaction(requestId: string) {
    const token = Buffer.from(
      `${appConfig.VTPASS_USERNAME}:${appConfig.VTPASS_PASSWORD}`,
    ).toString("base64");
    try {
      const res = await axiosClient<VTPassResponse>(
        `${appConfig.VTPASS_URL}/requery`,
        {
          method: "POST",
          body: {
            request_id: requestId,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": appConfig.VTPASS_API_KEY,
            "secret-key": appConfig.VTPASS_SECRET_KEY,
          },
        },
      );
      const handler = this.vtpassErrorHandler(res.code, res);
      if (!handler.status) {
        return { ...handler, body: null };
      }
      return { status: true, body: res, action: "none", message: "" };
    } catch (e) {
      console.log("Error validating vtpass transaction:", e);
      // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }

  vtpassErrorHandler(
    code: string,
    resp?: VTPassResponse,
  ): { message: string; status: boolean; action?: string | null } {
    switch (code) {
      case "000":
        if (resp && resp.content && resp.content.error) {
          console.log("resss", resp?.content);
          return { message: resp.content.error, status: false, action: "none" };
        }
        return {
          message: "Transaction processed",
          status: true,
          action: "none",
        };
      case "099":
        return {
          message: "Transaction is processing, please refresh the page",
          status: true,
          action: "none",
        };
      case "001":
        return {
          message: "Transaction query error, please refresh the page",
          status: false,
          action: "none",
        };
      case "044":
        return {
          message:
            "Transaction is under review, please reach out to your customer support",
          status: false,
          action: "none",
        };
      case "091":
        return {
          message: "Error processing this transaction from service provider ",
          status: false,
          action: "none",
        };
      case "016":
        return {
          message: "Transaction failed, please try again.",
          status: false,
          action: "none",
        };
      case "010":
        return {
          message: "Transaction contains an invalid variation code.",
          status: false,
          action: "none",
        };
      case "011":
        return {
          message: "Invalid argument passed to your request, please try again.",
          status: false,
          action: "none",
        };
      case "012":
        return {
          message: "Selected product does not exist",
          status: false,
          action: "none",
        };
      case "013":
        return {
          message:
            "You are attempting to pay an amount lower than the minimum allowed for that product/service.",
          status: false,
          action: "none",
        };
      case "014":
        return {
          message: "You have used the RequestID for a previous transaction.",
          status: false,
          action: "none",
        };
      case "015":
        return {
          message:
            "Invalid requestID, requestID not recognised by the service provider",
          status: false,
          action: "retry",
        };
      case "017":
        return {
          message:
            "You are attempting to pay an amount higher than the maximum allowed for that product/service",
          status: false,
          action: "none",
        };
      case "018":
        return {
          message: "Insuffient balance on your service provider account",
          status: false,
          action: "none",
        };
      case "019":
        return {
          message:
            "You attempted to buy the same service multiple times for the same biller_code within 30 seconds.",
          status: false,
          action: "none",
        };
      case "021":
        return {
          message: "Your account is locked",
          status: false,
          action: "none",
        };
      case "022":
        return {
          message: "Your account is suspended",
          status: false,
          action: "none",
        };
      case "023":
        return {
          message:
            "Your account does not have API access enabled. Please contact us to request for activation",
          status: false,
          action: "none",
        };
      case "024":
        return {
          message: "Your account is inactive.",
          status: false,
          action: "none",
        };
      case "025":
        return {
          message: "Your bank code for bank transfer is invalid.",
          status: false,
          action: "none",
        };
      case "026":
        return {
          message: "Your bank account number could not be verified.",
          status: false,
          action: "none",
        };
      case "027":
        return {
          message:
            "You need to contact support with your server IP for whitelisting.",
          status: false,
          action: "none",
        };
      case "028":
        return {
          message: "You need to whitelist products you want to vend",
          status: false,
          action: "none",
        };
      case "030":
        return {
          message: "The biller for the product or service is unreachable.",
          status: false,
          action: "none",
        };
      case "031":
        return {
          message:
            "You are under-requesting for a service that has a limit on the quantity to be purchased per time.",
          status: false,
          action: "none",
        };
      case "032":
        return {
          message:
            "You are over-requesting for a service that has a limit on the quantity to be purchased per time.",
          status: false,
          action: "none",
        };
      case "034":
        return {
          message:
            "The service being requested for has been suspended for the time being",
          status: false,
          action: "none",
        };
      case "035":
        return {
          message:
            "You are requesting for a service that has been turned off at the moment.",
          status: false,
          action: "none",
        };
      case "040":
        return {
          message: "Transaction reversal to wallet.",
          status: false,
          action: "none",
        };
      case "083":
        return {
          message: "Oops!!! System error. Please contact tech support",
          status: false,
          action: "none",
        };
      case "085":
        return {
          message: "Invalid request ID.",
          status: false,
          action: "none",
        };
      default:
        return {
          message: "An unknown error occurred. Please contact support.",
          status: false,
          action: "none",
        };
    }
  }
}
