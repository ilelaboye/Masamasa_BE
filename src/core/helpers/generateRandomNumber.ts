export const generateRandomNumber = (min = 999, max = 999999) => ~~(Math.random() * (max - min)) + min;

export const generateRandomNumberString = (length = 6) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
};
