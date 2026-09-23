/* eslint-disable @typescript-eslint/no-explicit-any -- the double below stands
   in for a TypeORM repository; typing it fully would be more scaffolding than
   the two assertions are worth. */
import { axiosClient } from "@/core/utils/axiosClient";
import { BankVerificationService } from "./bank-verification.service";

jest.mock("@/core/utils/axiosClient", () => ({ axiosClient: jest.fn() }));

// bank_verifications rows are what assertNotAlreadyUsed reads to decide
// whether an ID has been used before. Without user_id on the row there is no
// way to tell "this same user retrying" from "someone else's account", so a
// row written without it is what locks a user out of their own ID.

/** Captures what the service asked to save. */
function repositoryDouble() {
  const saved: any[] = [];
  return {
    saved,
    repo: {
      find: async () => [],
      create: (row: any) => ({ ...row }),
      save: async (row: any) => {
        saved.push(row);
        return row;
      },
    } as any,
  };
}

/** A NIN response shaped like the real one: verified, names and DOB matching. */
const ninResponse = {
  status: true,
  response_code: "00",
  data: {
    firstname: "LEKAN",
    middlename: "OLUWATOBI",
    surname: "ILELABOYE",
    birthdate: "01-04-1999",
    nin: "52119847125",
  },
};

describe("recordVerification attributes the row to the user", () => {
  beforeEach(() => (axiosClient as jest.Mock).mockReset());

  it("stores user_id on a successful number verification", async () => {
    (axiosClient as jest.Mock).mockResolvedValue(ninResponse);
    const { repo, saved } = repositoryDouble();
    const service = new BankVerificationService(repo);

    const result = await service.verifyIdentity(
      "nin",
      {
        number: "52119847125",
        dob: "1999-04-01",
        first_name: "Lekan",
        last_name: "Ilelaboye",
      },
      42,
    );

    expect(result.outcome).toBe("verified");
    expect(saved).toHaveLength(1);
    expect(saved[0].user_id).toBe(42);
    // The number itself is never stored in the clear beside the excerpt.
    expect(saved[0].value).toBe("521125");
    expect(saved[0].metadata.nin).toBeUndefined();
  });

  it("writes no row at all when the ID does not verify", async () => {
    (axiosClient as jest.Mock).mockResolvedValue({
      ...ninResponse,
      response_code: "01",
    });
    const { repo, saved } = repositoryDouble();
    const service = new BankVerificationService(repo);

    const result = await service.verifyIdentity(
      "nin",
      {
        number: "52119847125",
        dob: "1999-04-01",
        first_name: "Lekan",
        last_name: "Ilelaboye",
      },
      42,
    );

    expect(result.outcome).toBe("mismatch");
    expect(saved).toHaveLength(0);
  });
});
