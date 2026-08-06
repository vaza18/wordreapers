/**
 * Shared LAN UDP discovery contract for nearby archive sync (ADR-023).
 * Host announces *to* this port; every listener (host + client scan) must *bind* the same port.
 * `bind(0)` on the scanner is wrong — broadcasts to NEARBY_UDP_PORT never arrive.
 */
export const NEARBY_UDP_PORT = 38472;
export const NEARBY_UDP_MAGIC = 'wr-arch-v1' as const;

/** Port host datagrams are sent to — must equal {@link nearbyUdpDiscoveryListenPort}. */
export function nearbyUdpAnnounceDestinationPort(): number {
  return NEARBY_UDP_PORT;
}

/** Port scanners and hosts bind to receive discovery / HaveAck datagrams. */
export function nearbyUdpDiscoveryListenPort(): number {
  return NEARBY_UDP_PORT;
}

/**
 * `react-native-udp` createSocket options so multiple sockets (host + scan, or two apps)
 * can share {@link NEARBY_UDP_PORT}.
 */
export function nearbyUdpDiscoveryCreateSocketOptions(): {
  type: 'udp4';
  reusePort: true;
} {
  return { type: 'udp4', reusePort: true };
}
