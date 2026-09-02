import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  instrumentedSnapshotVal,
  instrumentedChildSnapshotVal,
  recordRtdbDown,
  recordRtdbUp,
  recordRtdbUpdate,
  recordRtdbRemove,
  recordSnapshotTrafficIfCollecting,
} from '@/lib/firebase/rtdb-instrumentation';
import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';

vi.mock('@/modules/native-traffic-stats', () => ({
  getAppTrafficBytes: vi.fn(() => ({ rxBytes: 0, txBytes: 0 })),
}));

describe('RTDB Instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });
    rtdbTrafficProbe.reset();
  });

  describe('recordRtdbDown', () => {
    it('records traffic in the probe', () => {
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      recordRtdbDown({ foo: 'bar' });
      expect(spy).toHaveBeenCalledWith('down', expect.any(Number));
    });

    it('records 0 bytes if value is undefined', () => {
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      recordRtdbDown(undefined);
      expect(spy).toHaveBeenCalledWith('down', 0);
    });
  });

  describe('recordRtdbUp', () => {
    it('records traffic in the probe', () => {
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      recordRtdbUp({ foo: 'bar' });
      expect(spy).toHaveBeenCalledWith('up', expect.any(Number));
    });
  });

  describe('recordRtdbUpdate', () => {
    it('records aggregate traffic for multi-path updates', () => {
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      const updates = {
        'path1/a': 123,
        'path2/b': 'hello',
      };
      recordRtdbUpdate(updates);
      // Expected bytes: ('path1/a'.length + bytes(123)) + ('path2/b'.length + bytes('hello'))
      expect(spy).toHaveBeenCalledWith('up', expect.any(Number));
    });
  });

  describe('instrumentedSnapshotVal', () => {
    it('extracts value and records traffic', () => {
      const mockSnapshot = {
        val: () => ({ data: 123 }),
      };
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');

      const val = instrumentedSnapshotVal(mockSnapshot);

      expect(val).toEqual({ data: 123 });
      expect(spy).toHaveBeenCalledWith('down', expect.any(Number));
    });

    it('extracts value without recording when not collecting', () => {
      useRtdbDiagnosticsStore.setState({
        developerModeEnabled: false,
        rtdbDiagnosticsEnabled: false,
      });
      const mockSnapshot = {
        val: vi.fn(() => ({ data: 1 })),
      };
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');

      expect(instrumentedSnapshotVal(mockSnapshot)).toEqual({ data: 1 });
      expect(mockSnapshot.val).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('handles null/undefined snapshot gracefully', () => {
      const val = instrumentedSnapshotVal(null);
      expect(val).toBeNull();
    });

    it('handles snapshot without val() function gracefully', () => {
      const val = instrumentedSnapshotVal({});
      expect(val).toBeNull();
    });
  });

  describe('recordSnapshotTrafficIfCollecting', () => {
    it('does not call val when not collecting', () => {
      useRtdbDiagnosticsStore.setState({
        developerModeEnabled: false,
        rtdbDiagnosticsEnabled: false,
      });
      const mockSnapshot = { val: vi.fn(() => ({ heavy: true })) };
      recordSnapshotTrafficIfCollecting(mockSnapshot);
      expect(mockSnapshot.val).not.toHaveBeenCalled();
    });

    it('records when collecting', () => {
      const mockSnapshot = { val: vi.fn(() => ({ heavy: true })) };
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      recordSnapshotTrafficIfCollecting(mockSnapshot);
      expect(mockSnapshot.val).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('down', expect.any(Number));
    });
  });

  describe('instrumentedChildSnapshotVal', () => {
    it('does not record before seed (avoids double-count with seed get)', () => {
      const mockSnapshot = { val: vi.fn(() => ({ word: true })) };
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      expect(instrumentedChildSnapshotVal(false, mockSnapshot)).toEqual({ word: true });
      expect(mockSnapshot.val).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('records after seed', () => {
      const mockSnapshot = { val: vi.fn(() => ({ word: true })) };
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      expect(instrumentedChildSnapshotVal(true, mockSnapshot)).toEqual({ word: true });
      expect(spy).toHaveBeenCalledWith('down', expect.any(Number));
    });
  });

  describe('recordRtdbRemove', () => {
    it('records path-length marker bytes', () => {
      const spy = vi.spyOn(rtdbTrafficProbe, 'record');
      recordRtdbRemove('game_sessions/ABCD/players/u1');
      expect(spy).toHaveBeenCalledWith('up', 'game_sessions/ABCD/players/u1'.length);
    });
  });
});
