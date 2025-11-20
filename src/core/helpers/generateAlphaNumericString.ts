export const generateAlphaNumericString = (length = 20): string => {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  return password;
};

export const generateMasamasaRef = (): string => {
  return `MASA${generateAlphaNumericString(10)}00${Date.now()}`;
};
