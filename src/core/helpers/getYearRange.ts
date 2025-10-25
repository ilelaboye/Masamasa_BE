export const getYearRange = (year: number): [Date, Date] => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);
  return [startOfYear, endOfYear];
};
