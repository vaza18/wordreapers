/**
 * When the first browse page is short but the counter claims more rooms,
 * expired/ghost index rows were filtered client-side — recount from the shard.
 */
export function shouldReconcilePublicLobbyBrowseTotal(input: {
  total: number;
  rowCount: number;
  pageSize: number;
  page: number;
}): boolean {
  const { total, rowCount, pageSize, page } = input;
  if (page !== 1 || total <= 0) {
    return false;
  }
  return rowCount < pageSize && rowCount < total;
}
