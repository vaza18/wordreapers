/** Whether an invite-sheet vote banner should stay visible for this viewer. */
export function shouldShowInvitePlayVoteBanner(
  proposedBy: string,
  viewerId: string,
  needsVote: boolean,
): boolean {
  return needsVote || proposedBy === viewerId;
}
