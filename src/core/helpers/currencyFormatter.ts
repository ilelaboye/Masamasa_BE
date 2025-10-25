export const currencyFormatter = (value, currencyCode = 'NGN', decimals = 2, currencyFormat = true) => {
  if (!value) return '0.00';
  const currencyValue = typeof value == 'string' ? parseInt(value) : value;

  return new Intl.NumberFormat('en-NG', {
    style: currencyFormat ? 'currency' : undefined,
    currency: currencyCode,
    minimumFractionDigits: decimals,
  }).format(currencyValue);
};
