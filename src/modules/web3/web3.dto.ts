import { ethers } from "ethers";

export class CreateWalletDto {
  id: string;
}

export class WithdrawEthDto {
  amount:number; 
  to:number;
}

export class WithdrawTokenDto {
 tokenAddress: string;
  amount: ethers.BigNumberish;
  to: string
}

export class TokenBalanceDto {
  token: string;
}
