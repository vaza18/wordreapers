export interface OnlineResultsRouteParams {
  [key: string]: string | undefined;
  gameId: string;
  baseWordRound?: string;
}

/** Build results route params, optionally pinning the round the viewer is reviewing. */
export function onlineResultsRoute(
  gameId: string,
  viewingBaseWordRound?: number | null,
): {
  pathname: '/online/results/[gameId]';
  params: OnlineResultsRouteParams;
} {
  const params: OnlineResultsRouteParams = { gameId };
  if (viewingBaseWordRound != null) {
    params.baseWordRound = String(viewingBaseWordRound);
  }
  return { pathname: '/online/results/[gameId]', params };
}
