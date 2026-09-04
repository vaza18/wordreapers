import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rtdbTrafficProbe, utf8JsonBytes } from '@/lib/debug/rtdb-traffic-probe';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';

vi.mock('@/modules/native-traffic-stats', () => ({
  getAppTrafficBytes: vi.fn(() => ({ rxBytes: 0, txBytes: 0 })),
}));

describe('utf8JsonBytes', () => {
  it('returns 0 for undefined', () => {
    expect(utf8JsonBytes(undefined)).toBe(0);
  });

  it('calculates bytes for small objects', () => {
    const obj = { a: 1 };
    // {"a":1} is 7 chars/bytes
    expect(utf8JsonBytes(obj)).toBe(JSON.stringify(obj).length);
  });

  it('handles non-ASCII characters correctly', () => {
    const text = 'Привіт'; // Ukrainian "Hello"
    // Each Cyrillic char is 2 bytes in UTF-8
    const obj = { t: text };
    const encoded = new TextEncoder().encode(JSON.stringify(obj));
    expect(utf8JsonBytes(obj)).toBe(encoded.length);
  });
});

describe('RtdbTrafficProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    rtdbTrafficProbe.reset();
    useRtdbDiagnosticsStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records traffic when collecting is enabled', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.record('down', 100);
    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.down).toBe(100);

    const buckets = rtdbTrafficProbe.getLiveBuckets();
    expect(buckets.length).toBe(1);
    expect(buckets[0].downBytes).toBe(100);
  });

  it('does not record traffic when disabled', () => {
    useRtdbDiagnosticsStore.setState({
      developerModeEnabled: false,
      rtdbDiagnosticsEnabled: false,
    });

    rtdbTrafficProbe.record('down', 100);
    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.down).toBe(0);
  });

  it('aggregates totals across multiple calls in the same second', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.record('down', 100);
    rtdbTrafficProbe.record('down', 50);
    rtdbTrafficProbe.record('up', 30);

    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.down).toBe(150);
    expect(totals.up).toBe(30);
  });

  it('starts a new bucket when time advances', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    const now = 1000000;
    vi.setSystemTime(now * 1000);
    rtdbTrafficProbe.record('down', 100);

    vi.setSystemTime((now + 1) * 1000);
    rtdbTrafficProbe.record('down', 200);

    const buckets = rtdbTrafficProbe.getLiveBuckets();
    expect(buckets.length).toBe(2);
    expect(buckets[0].tSec).toBe(now);
    expect(buckets[1].tSec).toBe(now + 1);
  });

  it('adds history entry when changing room id', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.setActiveRoomId('ROOM1');
    rtdbTrafficProbe.record('down', 100);

    rtdbTrafficProbe.setActiveRoomId('ROOM2');

    const history = useRtdbDiagnosticsStore.getState().history;
    expect(history.length).toBe(1);
    expect(history[0].roomId).toBe('ROOM1');
    expect(history[0].downTotal).toBe(100);

    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.roomId).toBe('ROOM2');
    expect(totals.down).toBe(0);
  });

  it('emits timeline action for large path-tagged downs', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });
    const payload = { x: 'y'.repeat(3000) };
    rtdbTrafficProbe.record('down', utf8JsonBytes(payload), 'session_word_maps/ABCDE/wordPlayers');
    const actions = rtdbTrafficProbe.getRecentActions(5);
    expect(actions[0]?.action).toBe('rtdb ↓ session_word_maps/ABCDE/wordPlayers');
  });

  it('does not emit timeline action for small downs', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });
    rtdbTrafficProbe.record('down', 100, 'game_sessions/ABCDE');
    expect(rtdbTrafficProbe.getRecentActions(5)).toEqual([]);
  });

  it('caps the number of actions recorded', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    for (let i = 0; i < 600; i++) {
      rtdbTrafficProbe.recordAction({ timestamp: Date.now(), action: `action ${i}` });
    }

    const actions = rtdbTrafficProbe.getRecentActions(600);
    expect(actions.length).toBe(500);
    expect(actions[0].action).toBe('action 599'); // Reverse order from getRecentActions
  });

  it('correctly handles rapid room ID changes and history commits', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    // 1. Join Room A
    rtdbTrafficProbe.setActiveRoomId('ROOM_A');
    rtdbTrafficProbe.record('down', 100);

    // 2. Join Room B (should commit A)
    rtdbTrafficProbe.setActiveRoomId('ROOM_B');
    rtdbTrafficProbe.record('up', 50);

    // 3. Re-join Room A (should commit B)
    rtdbTrafficProbe.setActiveRoomId('ROOM_A');

    const history = useRtdbDiagnosticsStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0].roomId).toBe('ROOM_B');
    expect(history[0].upTotal).toBe(50);
    expect(history[1].roomId).toBe('ROOM_A');
    expect(history[1].downTotal).toBe(100);

    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.roomId).toBe('ROOM_A');
    expect(totals.down).toBe(0);
    expect(totals.up).toBe(0);
  });

  it('flushes history immediately on explicit leave (setActiveRoomId null)', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.setActiveRoomId('ROOM1');
    rtdbTrafficProbe.record('down', 40);
    rtdbTrafficProbe.setActiveRoomId(null);

    const history = useRtdbDiagnosticsStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].roomId).toBe('ROOM1');
    expect(history[0].downTotal).toBe(40);
    expect(rtdbTrafficProbe.getRoomTotals().roomId).toBeNull();
  });

  it('keeps one history group across same-room remount without explicit leave', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.setActiveRoomId('WJLXZ');
    rtdbTrafficProbe.record('down', 100);
    rtdbTrafficProbe.recordAction({ timestamp: Date.now(), action: 'opened round results' });

    // play→results: subscribeGameSession teardown must NOT clear the sticky room.
    // Results re-subscribes with the same id (no-op) and keeps accumulating.
    rtdbTrafficProbe.setActiveRoomId('WJLXZ');
    rtdbTrafficProbe.record('down', 50);

    expect(useRtdbDiagnosticsStore.getState().history).toHaveLength(0);
    const totals = rtdbTrafficProbe.getRoomTotals();
    expect(totals.roomId).toBe('WJLXZ');
    expect(totals.down).toBe(150);
    expect(
      rtdbTrafficProbe.getRecentActions(5).some((a) => a.action === 'opened round results'),
    ).toBe(true);
  });

  it('flushes history when diagnostics collecting is disabled', () => {
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    rtdbTrafficProbe.setActiveRoomId('ROOM1');
    rtdbTrafficProbe.record('up', 25);

    useRtdbDiagnosticsStore.getState().setRtdbDiagnosticsEnabled(false);

    const history = useRtdbDiagnosticsStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].roomId).toBe('ROOM1');
    expect(history[0].upTotal).toBe(25);
    expect(rtdbTrafficProbe.getRoomTotals().down).toBe(0);
    expect(rtdbTrafficProbe.getRoomTotals().up).toBe(0);
  });

  it('starts wire polling when collecting is enabled in an active room', async () => {
    const { getAppTrafficBytes } = await import('@/modules/native-traffic-stats');
    const getBytes = vi.mocked(getAppTrafficBytes);
    getBytes.mockReturnValue({ rxBytes: 1000, txBytes: 500 });

    rtdbTrafficProbe.setActiveRoomId('ROOM1');
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });

    // First tick establishes native baseline; second records the delta.
    vi.advanceTimersByTime(1000);
    getBytes.mockReturnValue({ rxBytes: 1100, txBytes: 520 });
    vi.advanceTimersByTime(1000);

    expect(rtdbTrafficProbe.getRoomTotals().wireRx).toBe(100);
    expect(rtdbTrafficProbe.getRoomTotals().wireTx).toBe(20);
  });
});
