import { NotificationTokenValidation } from "./user.validation";

describe("notification token validation", () => {
  it("accepts a token", () => {
    const { error } = NotificationTokenValidation.validate({
      notification_token: "fcm-device-token",
    });
    expect(error).toBeUndefined();
  });

  // An empty or missing token would overwrite a working one with nothing,
  // silently cutting the device off from every push we send.
  it("rejects an empty or missing token", () => {
    expect(
      NotificationTokenValidation.validate({ notification_token: "" }).error,
    ).toBeDefined();
    expect(NotificationTokenValidation.validate({}).error).toBeDefined();
  });
});
