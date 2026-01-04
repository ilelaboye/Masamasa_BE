import { ethers } from "ethers";

export class CreateWalletDto {
  id: string;
}

export class WithdrawTokenDto {
  amount: ethers.BigNumberish;
  to: string;
  network: string;
  symbol: string;
  destinationTag?: number;
}

export class TokenBalanceDto {
  token: string;
}
