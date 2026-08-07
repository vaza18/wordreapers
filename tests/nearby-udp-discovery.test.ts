import { describe, expect, it } from 'vitest';

import {
  nearbyUdpAnnounceDestinationPort,
  nearbyUdpDiscoveryCreateSocketOptions,
  nearbyUdpDiscoveryListenPort,
  NEARBY_UDP_PORT,
} from '@/lib/online/nearby/udp-discovery';

describe('nearby UDP discovery bind contract', () => {
  it('announce destination port equals listen/bind port', () => {
    expect(nearbyUdpAnnounceDestinationPort()).toBe(NEARBY_UDP_PORT);
    expect(nearbyUdpDiscoveryListenPort()).toBe(NEARBY_UDP_PORT);
    expect(nearbyUdpAnnounceDestinationPort()).toBe(nearbyUdpDiscoveryListenPort());
  });

  it('discovery sockets request reusePort for shared listen port', () => {
    expect(nearbyUdpDiscoveryCreateSocketOptions()).toEqual({
      type: 'udp4',
      reusePort: true,
    });
  });
});
