/* eslint-disable @typescript-eslint/no-explicit-any -- the service is
   constructed with null collaborators because assertPinResetFreeze touches
   none of them; typing eleven unused doubles would be more scaffolding than
   the assertions are worth. */
import { PIN_RESET_FREEZE_HOURS } from "@/constants";
import { User } from "../entities/user.entity";
import { UsersService } from "./users.service";

// The freeze is the only thing standing between a hijacked inbox and the
// account's money, so the boundary matters: an hour inside the window must
// block, an hour outside must not, and an account that has never reset must be
// untouched.

const service = new UsersService(
  ...(Array(11).fill(null) as [
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
  ]),
);

// assertPinResetFreeze is private — reached the way the two debit paths reach
// it, without widening its visibility just for the test.
const check = (user: Partial<User>) =>
  (service as any).assertPinResetFreeze(user);

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

describe("assertPinResetFreeze", () => {
  it("allows an account that has never reset its PIN", () => {
    expect(() => check({ pin_reset_at: null })).not.toThrow();
    expect(() => check({})).not.toThrow();
  });

  it("blocks inside the freeze window", () => {
    expect(() => check({ pin_reset_at: hoursAgo(1) })).toThrow(
      /withdrawals and transfers are paused/i,
    );
    // Just short of the boundary still blocks.
    expect(() =>
      check({ pin_reset_at: hoursAgo(PIN_RESET_FREEZE_HOURS - 0.5) }),
    ).toThrow(/paused/i);
  });

  it("allows once the window has elapsed", () => {
    expect(() =>
      check({ pin_reset_at: hoursAgo(PIN_RESET_FREEZE_HOURS + 0.5) }),
    ).not.toThrow();
  });
});
