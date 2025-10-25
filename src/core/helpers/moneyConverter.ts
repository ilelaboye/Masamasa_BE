export const moneyConverter = (money: string | number) => (typeof money === 'number' ? money * 100 : parseFloat(money) * 100);

export const moneyReverter = (money: number) => {
  if (typeof money !== 'number') return '0';

  const decimalMoney = money / 100;
  return decimalMoney.toFixed(2);
};
