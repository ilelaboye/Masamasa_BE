/* eslint-disable @typescript-eslint/no-explicit-any -- the test doubles below
   stand in for a TypeORM repository, DataSource and query builder; typing them
   fully would be more scaffolding than the three assertions are worth. */
import { WITHDRAWAL_MAX_ADDRESS_VERIFIED } from "@/constants";
import { UpdateWithdrawalLimitValidation } from "@/modules/administrator/validations/admin.validation";
import { KycStatus, User } from "../entities/user.entity";
import { UsersService } from "./users.service";

// The daily ceiling now lives on the account (users.withdrawal_limit) instead
// of being derived from KYC status at read time. These cover the two things
// that would silently let money out if they broke: the figure the service
// reports coming from the column, and the admin cap staying inside the bound
// WithdrawalValidation enforces.

/**
 * Stand-in for the `createQueryBuilder(...).select(...)...getRawOne()` chain
 * getWithdrawnToday builds. Every builder method returns the chain; getRawOne
 * resolves to the day's total.
 */
const managerReturning = (total: number) => ({
  createQueryBuilder: () => {
    const chain: any = new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "getRawOne"
            ? async () => ({ total: String(total) })
            : () => chain,
      },
    );
    return chain;
  },
});

const serviceFor = (user: Partial<User>, withdrawnToday: number) =>
  new UsersService(
    { findOne: async () => user } as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    { manager: managerReturning(withdrawnToday) } as any,
    null as any,
    null as any,
    null as any,
  );

const req = { user: { id: 1 } } as any;

describe("withdrawalLimits", () => {
  it("reports the account's own limit, not one derived from KYC status", async () => {
    // Verified, but an admin has held this account to 200,000.
    const service = serviceFor(
      { id: 1, kyc_status: KycStatus.success, withdrawal_limit: 200000 },
      0,
    );

    const limits = await service.withdrawalLimits(req);

    expect(limits.maxPerDay).toBe(200000);
    expect(limits.remainingToday).toBe(200000);
    expect(limits.kycVerified).toBe(true);
  });

  it("gives an unverified account whatever its column says", async () => {
    const service = serviceFor(
      { id: 1, kyc_status: KycStatus.none, withdrawal_limit: 50000 },
      20000,
    );

    const limits = await service.withdrawalLimits(req);

    expect(limits.maxPerDay).toBe(50000);
    expect(limits.withdrawnToday).toBe(20000);
    expect(limits.remainingToday).toBe(30000);
  });

  it("never reports a negative allowance after a limit is lowered", async () => {
    // Admin cut the limit to 10,000 after 75,000 had already gone out today.
    const service = serviceFor(
      { id: 1, kyc_status: KycStatus.success, withdrawal_limit: 10000 },
      75000,
    );

    const limits = await service.withdrawalLimits(req);

    expect(limits.remainingToday).toBe(0);
  });
});

describe("UpdateWithdrawalLimitValidation", () => {
  const validate = (withdrawal_limit: unknown) =>
    UpdateWithdrawalLimitValidation.validate({ withdrawal_limit });

  it("accepts zero, which blocks withdrawals for the account", () => {
    expect(validate(0).error).toBeUndefined();
  });

  it("accepts the maximum a withdrawal request may itself be", () => {
    expect(validate(WITHDRAWAL_MAX_ADDRESS_VERIFIED).error).toBeUndefined();
  });

  it("rejects a limit no withdrawal could ever use", () => {
    // Above this, WithdrawalValidation would reject the request before the
    // service ever compared it to the account's limit.
    expect(validate(WITHDRAWAL_MAX_ADDRESS_VERIFIED + 1).error).toBeDefined();
    expect(validate(-1).error).toBeDefined();
  });
});
