import { describe, expect, it } from 'vitest';

import {
  routeRequiresConnectivityMonitoring,
  resolveConnectivityMonitoringEnabled,
} from '../lib/online/connectivity-scope.js';

describe('resolveConnectivityMonitoringEnabled', () => {
  it('defers to route when override is null', () => {
    expect(resolveConnectivityMonitoringEnabled(true, null)).toBe(true);
    expect(resolveConnectivityMonitoringEnabled(false, null)).toBe(false);
  });

  it('uses explicit override when set', () => {
    expect(resolveConnectivityMonitoringEnabled(true, false)).toBe(false);
    expect(resolveConnectivityMonitoringEnabled(false, true)).toBe(true);
  });
});

describe('routeRequiresConnectivityMonitoring', () => {
  it('enables monitoring for join, browse, lobby, and online results flows', () => {
    expect(routeRequiresConnectivityMonitoring('/online/join')).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/browse')).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/lobby/abc123')).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/pick-word/abc123')).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/results/abc123')).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/left/abc123')).toBe(true);
  });

  it('enables monitoring for lobby setup edits only', () => {
    expect(routeRequiresConnectivityMonitoring('/online/setup', { from: 'lobby' })).toBe(true);
    expect(routeRequiresConnectivityMonitoring('/online/setup')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/online/setup', { from: 'home' })).toBe(false);
  });

  it('disables monitoring for offline-safe routes', () => {
    expect(routeRequiresConnectivityMonitoring('/')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/history')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/history/room/abc123')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/online/solo/abc123')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/online/solo-results/abc123')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/online/play/abc123')).toBe(false);
    expect(routeRequiresConnectivityMonitoring('/settings')).toBe(false);
  });
});
