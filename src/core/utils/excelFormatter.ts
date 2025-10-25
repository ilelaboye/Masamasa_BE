import { moneyReverter } from "../helpers/moneyConverter";

export const vatSummaryExcelFormatter = (transactions: any[]) => {
  return transactions.map((t) => ({
    "Transaction Number": t.transaction_number,
    "Payment Number": t.payment_number,
    Currency: t.currency_code,
    Gross: moneyReverter(t.gross),
    "Additions - % (e.g VAT)": t.additions,
    "Deductions (%)": t.deductions,
    "Net Amount": moneyReverter(t.net),
    "Business Purpose": t.business_purpose,
    Type: t.entity_mode,
    Date: new Date(t.created_at).toISOString(),
  }));
};
