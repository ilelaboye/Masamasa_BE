import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ValidateMeterNoDto,
  PurchaseRequestItemDto,
  IElectricityPurchaseDto,
} from "./dto/purchase.dto";
import { PurchaseStatus, PurchaseType } from "./entities/purchases.entity";
import { PurchaseService } from "./services/purchases.service";
import { ProviderService } from "./services/providers.service";
import {
  CreateAirtimePurchaseValidation,
  CreateDataPurchaseValidation,
  CreateElectricityPurchaseValidation,
  CreatePurchaseValidation,
  ValidateMeterNumber,
} from "./validations/purchase.validation";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Purchase")
@Controller("purchases")
export class PurchaseController {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly providerService: ProviderService
  ) {}

  @ApiOperation({ summary: "Create airtime purchase" })
  @UsePipes(new JoiValidationPipe(CreateAirtimePurchaseValidation))
  @Post("airtime")
  async createAirtime(
    @Body() createAirtimePurchaseDto: PurchaseRequestItemDto,
    @Req() req: UserRequest
  ) {
    return await this.purchaseService.createAirtime(
      createAirtimePurchaseDto,
      req
    );
  }

  @Post("data")
  @ApiOperation({ summary: "Create data purchase" })
  @UsePipes(new JoiValidationPipe(CreateDataPurchaseValidation))
  async createData(
    @Body() createDataPurchaseDto: PurchaseRequestItemDto,
    @Req() req: UserRequest
  ) {
    return await this.purchaseService.createData(createDataPurchaseDto, req);
  }

  @Post("electricity")
  @ApiOperation({ summary: "Create electricity purchase" })
  @UsePipes(new JoiValidationPipe(CreateElectricityPurchaseValidation))
  async createElecticity(
    @Body() electricityPurchaseDto: IElectricityPurchaseDto,
    @Req() req: UserRequest
  ) {
    return await this.purchaseService.createElectricity(
      electricityPurchaseDto,
      req
    );
  }

  @ApiOperation({ summary: "Get all purchase associated to the organization" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search a request by data",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "How many data per page? Maximum of 100 data",
    type: "number",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page of request data",
    type: "number",
  })
  @ApiQuery({
    name: "type",
    required: false,
    description: "Filter through the type of purchase request eg airtime,data",
    enum: PurchaseType,
  })
  @ApiQuery({
    name: "date_from",
    required: false,
    description: "Filter request by date",
  })
  @ApiQuery({
    name: "date_to",
    required: false,
    description: "Filter request by date",
  })
  @ApiQuery({
    name: "mode",
    required: false,
    description: "Filter through the status of a payee",
    enum: PurchaseStatus,
  })
  @Get()
  async findAll(@Req() req: UserRequest) {
    return await this.purchaseService.findAll(req);
  }

  @ApiOperation({ summary: "View single purchase" })
  @Get(":id/view")
  async findOne(@Param("id") id: string, @Req() req: UserRequest) {
    return await this.purchaseService.findOne(+id, req, true);
  }

  @Get("service-providers")
  async getServiceProviders(@Req() req: UserRequest) {
    return await this.providerService.getServiceList();
  }

  @Get("service-provider/:serviceID")
  async getServiceProvider(
    @Param("serviceID") serviceID: string,
    @Req() req: UserRequest
  ) {
    return await this.providerService.getServiceByID(serviceID);
  }

  @Get("service-variation/:serviceID")
  async getServiceVariation(
    @Param("serviceID") serviceID: string,
    @Req() req: UserRequest
  ) {
    return await this.providerService.getServiceVariation(serviceID);
  }

  @ApiOperation({ summary: "validate meter number" })
  @UsePipes(new JoiValidationPipe(ValidateMeterNumber))
  @Post("service-provider/verify-meter")
  async validateMeterNumber(
    @Body() validateMeterNoDto: ValidateMeterNoDto,
    @Req() req: UserRequest
  ) {
    return await this.providerService.validateMeterNumber(validateMeterNoDto);
  }
}
