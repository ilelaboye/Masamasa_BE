export const paginate = (total: number, page: number, limit: number) => {
  let totalPages = limit ? Math.ceil(total / limit) : 1;

  const previousPage = page - 1 > 0 ? page - 1 : null;
  const nextPage = totalPages && page < totalPages ? page + 1 : null;

  totalPages = total < 1 ? 0 : totalPages;
  return { total, totalPages, currentPage: page, previousPage, nextPage };
};
