import {
  CreateAccountValidation,
  UpdateAccountValidation,
} from "./user.validation";

const base = {
  first_name: "ada",
  last_name: "obi",
  email: "ada@example.com",
  phone: "+2348012345678",
  country: "Nigeria",
  password: "secret123",
  password_confirmation: "secret123",
};

describe("username validation", () => {
  it("is required at signup and on profile update", () => {
    expect(CreateAccountValidation.validate(base).error).toBeDefined();
    expect(
      UpdateAccountValidation.validate({
        first_name: "ada",
        last_name: "obi",
        phone: "+2348012345678",
      }).error,
    ).toBeDefined();
  });

  it("lowercases and accepts letters, digits and underscores", () => {
    const { error, value } = CreateAccountValidation.validate({
      ...base,
      username: "Ada_Obi9",
    });
    expect(error).toBeUndefined();
    expect(value.username).toBe("ada_obi9");
  });

  it("rejects spaces, symbols and out-of-range lengths", () => {
    for (const username of [
      "ab",
      "a".repeat(31),
      "ada obi",
      "ada-obi",
      "@ada",
    ]) {
      expect(
        CreateAccountValidation.validate({ ...base, username }).error,
      ).toBeDefined();
    }
  });
});
