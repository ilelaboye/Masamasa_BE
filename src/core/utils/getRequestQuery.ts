export const getRequestQuery = (req) => {
  const mode = req.query.mode as string;
  const type = req.query.type as string;
  const search = req.query.search as string;
  const level = req.query.level as string;
  const date_to = req.query.date_to as string;
  const date_from = req.query.date_from as string;
  const currency = req.query.currency as string;
  const payee = req.query.payee as string;
  const payee_search = req.query.payee_search as string;

  const page = req.query.page && typeof req.query.page == 'string' && parseInt(req.query.page) ? parseInt(req.query.page) : 1;
  let limit = req.query.limit && typeof req.query.limit == 'string' && parseInt(req.query.limit) ? parseInt(req.query.limit) : 50;
  limit = Math.max(limit, 1);
  limit = Math.min(limit, 200);
  const skip = (page - 1) * limit;

  return { page, limit, skip, mode, search, type, level, date_to, date_from, currency, payee, payee_search };
};

export const getTransactionQueryFilter = (req) => {
  const type = req.query.type as string;
  const date_to = req.query.date_to as string;
  const date_from = req.query.date_from as string;
  const currency = req.query.currency as string;
  const status = req.query.status as string;
  const business_purpose = req.query.business_purpose as string;
  const category = req.query.category as string;
  const sub_category = req.query.sub_category as string;

  return { date_to, date_from, currency, status, business_purpose, type, category, sub_category };
};

export const getBudgetCategoryQueryFilter = (req) => {
  const year = req.query.year as string;
  const currency = req.query.currency as string;
  const type = req.query.type as string;

  return { year, currency, type };
};
