/**
 * Round-over modal visibility — shown whenever the round has ended (not dismissible).
 */
export function useRoundTimeUpModal(roundEnded: boolean) {
  return { timeUpModalVisible: roundEnded };
}
