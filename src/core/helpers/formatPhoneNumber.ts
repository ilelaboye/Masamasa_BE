export const formatPhoneNumber = (
  phoneNumber: string,
  countryCode = "+234",
): string => {
  const countryCodeRegex = /^\+\d+/;
  if (!countryCodeRegex.test(phoneNumber)) {
    phoneNumber = countryCode + phoneNumber.slice(1);
  }
  return phoneNumber;
};
