import { randomInt } from "crypto";

export const generateRandomNumber =(min = 999, max = 999999) =>
  ~~(Math.random() * (max - min)) + min;

// Used for emailed codes, so it must be unpredictable: crypto, not Math.random.
export const generateRandomNumberString = (length = 6) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += randomInt(10).toString();
  }
  return result;
};
