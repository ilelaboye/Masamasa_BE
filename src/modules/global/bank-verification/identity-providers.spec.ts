import {
  IDENTITY_PROVIDERS,
  IdentityInput,
  classifyHttpError,
  classifyResponse,
  dobMismatch,
  isOperational,
  namesMatch,
  normaliseDob,
} from "./identity-providers";

/**
 * Each Prembly endpoint takes a different body and answers in a different
 * shape. A wrong mapping here does not crash — it silently sends an
 * incomplete request, or reads names out of a field that does not exist and
 * rejects a legitimate user. These lock the table down.
 */

const input: IdentityInput = {
  number: "12345678901",
  dob: "1994-08-21",
  nin: "98765432109",
  first_name: "Lekan",
  last_name: "Ilelaboye",
};

describe("identity provider table", () => {
  it("sends each endpoint exactly the fields it documents", () => {
    expect(IDENTITY_PROVIDERS.bvn.body(input)).toEqual({
      number: "12345678901",
    });
    expect(IDENTITY_PROVIDERS.nin.body(input)).toEqual({
      number: "12345678901",
    });
    expect(IDENTITY_PROVIDERS.voters_card.body(input)).toEqual({
      number: "12345678901",
    });

    // The passport endpoint cross-checks the holder's NIN and dob.
    expect(IDENTITY_PROVIDERS.passport.body(input)).toEqual({
      number: "12345678901",
      nin: "98765432109",
      dob: "1994-08-21",
    });

    // FRSC matches the full name and dob we send.
    expect(IDENTITY_PROVIDERS.drivers_license.body(input)).toEqual({
      number: "12345678901",
      dob: "1994-08-21",
      first_name: "Lekan",
      last_name: "Ilelaboye",
    });
  });

  it("reads the names out of each response shape", () => {
    expect(
      IDENTITY_PROVIDERS.nin.names({
        data: { firstname: "Lekan", surname: "Ilelaboye", middlename: "Tayo" },
      }),
    ).toEqual(["Lekan", "Ilelaboye", "Tayo"]);

    expect(
      IDENTITY_PROVIDERS.passport.names({
        data: { firstName: "Lekan", lastName: "Ilelaboye" },
      }),
    ).toEqual(["Lekan", "Ilelaboye", undefined]);

    expect(
      IDENTITY_PROVIDERS.voters_card.names({
        data: { fullName: "Lekan Tayo Ilelaboye" },
      }),
    ).toEqual(["Lekan Tayo Ilelaboye"]);
  });

  it("has nothing to match for a driver's licence", () => {
    // FRSC returns a verdict, not details — a null list means "already
    // matched by the provider", which is not the same as "no names found".
    expect(IDENTITY_PROVIDERS.drivers_license.names({})).toBeNull();
  });

  it("only passes a licence when FRSC itself verified it", () => {
    const { verified } = IDENTITY_PROVIDERS.drivers_license;
    expect(verified({ status: true, frsc_data: { verified: true } })).toBe(
      true,
    );
    // A successful call that did not verify must not count as a pass.
    expect(verified({ status: true, frsc_data: { verified: false } })).toBe(
      false,
    );
    expect(verified({ status: true })).toBe(false);
  });

  it("reads each endpoint's birthdate field", () => {
    expect(
      IDENTITY_PROVIDERS.nin.dob({ data: { birthdate: "21-08-1994" } }),
    ).toBe("21-08-1994");
    expect(
      IDENTITY_PROVIDERS.bvn.dob({ data: { dateOfBirth: "1994-08-21" } }),
    ).toBe("1994-08-21");
    expect(
      IDENTITY_PROVIDERS.passport.dob({ data: { dateOfBirth: "1994-08-21" } }),
    ).toBe("1994-08-21");
    expect(IDENTITY_PROVIDERS.drivers_license.dob({})).toBeUndefined();
  });
});

describe("namesMatch", () => {
  it("matches however the user split their names across the fields", () => {
    const record = ["Lekan", "Ilelaboye", "Tayo"];
    expect(namesMatch(record, "Lekan Tayo", "Ilelaboye")).toBe(true);
    expect(namesMatch(record, "Lekan", "Tayo Ilelaboye")).toBe(true);
    expect(namesMatch(record, "lekan", "ILELABOYE")).toBe(true);
  });

  it("matches a full name returned as one string", () => {
    expect(namesMatch(["Lekan Tayo Ilelaboye"], "Lekan", "Ilelaboye")).toBe(
      true,
    );
  });

  it("treats hyphens and punctuation as separators", () => {
    expect(
      namesMatch(["Lekan", "Ilelaboye-Tayo"], "Lekan", "Ilelaboye Tayo"),
    ).toBe(true);
  });

  it("rejects a name that is not on the record", () => {
    expect(namesMatch(["Lekan", "Ilelaboye"], "Lekan", "Adewale")).toBe(false);
  });

  it("needs two distinct matches, so one repeated name cannot pass", () => {
    expect(namesMatch(["Lekan", "Ilelaboye"], "Lekan", "Lekan")).toBe(false);
  });

  it("fails closed on an empty record", () => {
    expect(namesMatch([], "Lekan", "Ilelaboye")).toBe(false);
    expect(namesMatch([undefined, null], "Lekan", "Ilelaboye")).toBe(false);
  });
});

describe("normaliseDob", () => {
  it("reads both orders Prembly answers in", () => {
    // NIN answers DD-MM-YYYY; new Date() cannot parse that at all.
    expect(normaliseDob("21-08-1994")).toBe("1994-08-21");
    expect(normaliseDob("1994-08-21")).toBe("1994-08-21");
    expect(normaliseDob("1/2/1990")).toBe("1990-02-01");
  });

  it("returns null when there is no date to read", () => {
    expect(normaliseDob("")).toBeNull();
    expect(normaliseDob(null)).toBeNull();
    expect(normaliseDob("not a date")).toBeNull();
  });
});

describe("dobMismatch", () => {
  it("catches a genuine mismatch across differing formats", () => {
    expect(dobMismatch("21-08-1994", "1994-08-21")).toBe(false);
    expect(dobMismatch("22-08-1994", "1994-08-21")).toBe(true);
  });

  it("does not reject when either side has no date", () => {
    // The driver's licence endpoint returns no birthdate at all — that is an
    // absent check, not a failed one.
    expect(dobMismatch(undefined, "1994-08-21")).toBe(false);
    expect(dobMismatch("1994-08-21", undefined)).toBe(false);
  });
});

describe("classifyResponse", () => {
  it("passes a genuine success", () => {
    expect(
      classifyResponse({
        status: true,
        response_code: "00",
        verification: { status: "VERIFIED" },
      }),
    ).toBeNull();
  });

  it("does not treat a 200 as a pass", () => {
    // Prembly answers HTTP 200 for failures too — the verdict is the code.
    expect(classifyResponse({ status: true, response_code: "01" })).toBe(
      "ID_NOT_FOUND",
    );
  });

  it("blames our wallet, not the user, for code 03", () => {
    // Insufficient balance on OUR Prembly account. Reporting this as a bad ID
    // would have the user retrying something that cannot succeed.
    const reason = classifyResponse({ response_code: "03" });
    expect(reason).toBe("PROVIDER_ACCOUNT");
    expect(isOperational(reason!)).toBe(true);
  });

  it("separates their downtime from a bad ID", () => {
    expect(isOperational(classifyResponse({ response_code: "02" })!)).toBe(
      true,
    );
    expect(isOperational(classifyResponse({ response_code: "01" })!)).toBe(
      false,
    );
  });

  it("flags a blocked ID as its own reason", () => {
    expect(classifyResponse({ response_code: "07" })).toBe("ID_BLOCKED");
  });

  it("reads the verification status when there is no code", () => {
    expect(
      classifyResponse({
        status: true,
        verification: { status: "NOT-VERIFIED" },
      }),
    ).toBe("ID_INVALID");
    // PENDING means their side failed and will retry — not a verdict.
    expect(
      isOperational(
        classifyResponse({
          status: true,
          verification: { status: "PENDING" },
        })!,
      ),
    ).toBe(true);
  });

  it("falls back to the top-level flag", () => {
    expect(classifyResponse({ status: false })).toBe("ID_NOT_FOUND");
    expect(classifyResponse(null)).toBe("ID_NOT_FOUND");
  });
});

describe("classifyHttpError", () => {
  it("never blames the user for our credentials or their rate limit", () => {
    expect(classifyHttpError({ response: { status: 401 } })).toBe(
      "PROVIDER_ACCOUNT",
    );
    expect(classifyHttpError({ response: { status: 403 } })).toBe(
      "PROVIDER_ACCOUNT",
    );
    expect(classifyHttpError({ response: { status: 429 } })).toBe(
      "RATE_LIMITED",
    );
    expect(
      isOperational(classifyHttpError({ response: { status: 500 } })),
    ).toBe(true);
  });

  it("treats an unprocessable ID as the user's to fix", () => {
    expect(classifyHttpError({ response: { status: 422 } })).toBe("ID_INVALID");
  });

  it("treats a timeout or network failure as unavailable", () => {
    expect(isOperational(classifyHttpError({ code: "ECONNABORTED" }))).toBe(
      true,
    );
  });
});
