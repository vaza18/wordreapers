import { useCallback, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import type { KeyRect } from '@/components/LetterKeyboard';
import {
  draftFlyGlyphTopLeftFromLineLayout,
  type DraftLineLayout,
} from '@/lib/game/draft-fly-layout';
import { DRAFT_FLY_DURATION_MS } from '@/constants/compose-draft';
import {
  draftLetterFlyEndPointFromTopLeft,
  draftLetterFlyStartPoint,
  isPendingDraftFlyValid,
  type Point,
} from '@/lib/game/draft-letter-fly';
import { draftFlyScaleEndpoints } from '@/lib/game/draft-text-scale';

export type PendingFlyLaunch = {
  charIndex: number;
  label: string;
  keyRect: KeyRect;
  hostOrigin: Point;
  draftFontSize: number;
  keyLabelFontSize: number;
  draftLineHeight: number;
  letterSpacing: number;
};

export type ActiveDraftFly = {
  charIndex: number;
  letter: string;
  position: Animated.ValueXY;
  scale: Animated.Value;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

type PendingFly = {
  keyIndex: number;
  charIndex: number;
};

type FlyMeta = {
  hostOrigin: Point;
  draftFontSize: number;
  keyLabelFontSize: number;
};

function remainingFlyMs(startedAt: number): number {
  return Math.max(16, DRAFT_FLY_DURATION_MS - (Date.now() - startedAt));
}

/** Ghost-letter fly animation state for the compose panel. */
export function useDraftLetterFly(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const revealingIndicesRef = useRef(new Set<number>());
  const pendingFliesRef = useRef<PendingFly[]>([]);
  const pendingLaunchesRef = useRef(new Map<number, PendingFlyLaunch>());
  const flyMetaRef = useRef(new Map<number, FlyMeta>());
  const flyStartedAtRef = useRef(new Map<number, number>());
  const flyHandoffTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const activeFliesRef = useRef<ActiveDraftFly[]>([]);
  const [activeFlies, setActiveFlies] = useState<ActiveDraftFly[]>([]);
  const [revealVersion, setRevealVersion] = useState(0);

  const setFlies = useCallback((updater: (flies: ActiveDraftFly[]) => ActiveDraftFly[]) => {
    setActiveFlies((flies) => {
      const next = updater(flies);
      activeFliesRef.current = next;
      return next;
    });
  }, []);

  const bumpRevealVersion = useCallback(() => {
    setRevealVersion((version) => version + 1);
  }, []);

  const clearFlyHandoffTimer = useCallback((charIndex: number) => {
    const timer = flyHandoffTimersRef.current.get(charIndex);
    if (timer) {
      clearTimeout(timer);
      flyHandoffTimersRef.current.delete(charIndex);
    }
  }, []);

  const animateFlyScale = useCallback(
    (scale: Animated.Value, toValue: number, charIndex: number) => {
      const startedAt = flyStartedAtRef.current.get(charIndex) ?? Date.now();
      scale.stopAnimation(() => {
        Animated.timing(scale, {
          toValue,
          duration: remainingFlyMs(startedAt),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    },
    [],
  );

  const animateFlyPosition = useCallback(
    (position: Animated.ValueXY, end: Point, charIndex: number) => {
      const startedAt = flyStartedAtRef.current.get(charIndex) ?? Date.now();
      position.stopAnimation(() => {
        Animated.timing(position, {
          toValue: end,
          duration: remainingFlyMs(startedAt),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    },
    [],
  );

  const completeCharReveal = useCallback(
    (charIndex: number) => {
      if (!revealingIndicesRef.current.delete(charIndex)) {
        return;
      }
      bumpRevealVersion();
    },
    [bumpRevealVersion],
  );

  const removeFly = useCallback(
    (charIndex: number, stop = true) => {
      clearFlyHandoffTimer(charIndex);
      flyStartedAtRef.current.delete(charIndex);
      flyMetaRef.current.delete(charIndex);
      setFlies((flies) => {
        const fly = flies.find((entry) => entry.charIndex === charIndex);
        if (!fly) {
          return flies;
        }
        if (stop) {
          fly.position.stopAnimation();
          fly.scale.stopAnimation();
        }
        return flies.filter((entry) => entry.charIndex !== charIndex);
      });
    },
    [clearFlyHandoffTimer, setFlies],
  );

  const handoffFlyToDraft = useCallback(
    (charIndex: number) => {
      completeCharReveal(charIndex);
      removeFly(charIndex, false);
    },
    [completeCharReveal, removeFly],
  );

  const scheduleFlyHandoff = useCallback(
    (charIndex: number) => {
      clearFlyHandoffTimer(charIndex);
      const startedAt = flyStartedAtRef.current.get(charIndex) ?? Date.now();
      flyHandoffTimersRef.current.set(
        charIndex,
        setTimeout(() => {
          flyHandoffTimersRef.current.delete(charIndex);
          handoffFlyToDraft(charIndex);
        }, remainingFlyMs(startedAt)),
      );
    },
    [clearFlyHandoffTimer, handoffFlyToDraft],
  );

  const clearActiveFlies = useCallback(() => {
    for (const timer of flyHandoffTimersRef.current.values()) {
      clearTimeout(timer);
    }
    flyHandoffTimersRef.current.clear();
    flyStartedAtRef.current.clear();
    flyMetaRef.current.clear();
    pendingLaunchesRef.current.clear();
    setFlies((flies) => {
      for (const fly of flies) {
        fly.position.stopAnimation();
        fly.scale.stopAnimation();
      }
      return [];
    });
  }, [setFlies]);

  const cancelCharReveal = useCallback(
    (charIndex: number) => {
      if (!revealingIndicesRef.current.delete(charIndex)) {
        return;
      }
      bumpRevealVersion();
    },
    [bumpRevealVersion],
  );

  const clearCharReveals = useCallback(() => {
    revealingIndicesRef.current.clear();
    pendingFliesRef.current = [];
    clearActiveFlies();
    bumpRevealVersion();
  }, [bumpRevealVersion, clearActiveFlies]);

  const prunePendingFromCharIndex = useCallback((charIndex: number) => {
    pendingFliesRef.current = pendingFliesRef.current.filter(
      (pending) => pending.charIndex < charIndex,
    );
    pendingLaunchesRef.current.delete(charIndex);
    for (const key of pendingLaunchesRef.current.keys()) {
      if (key >= charIndex) {
        pendingLaunchesRef.current.delete(key);
      }
    }
  }, []);

  const queueFlyForKey = useCallback(
    (keyIndex: number, charIndex: number) => {
      if (!enabled) {
        return;
      }
      pendingFliesRef.current.push({ keyIndex, charIndex });
    },
    [enabled],
  );

  const beginCharReveal = useCallback(
    (charIndex: number) => {
      cancelCharReveal(charIndex);
      revealingIndicesRef.current.add(charIndex);
      bumpRevealVersion();
    },
    [bumpRevealVersion, cancelCharReveal],
  );

  const launchFly = useCallback(
    (launch: PendingFlyLaunch, layout: DraftLineLayout) => {
      if (activeFliesRef.current.some((fly) => fly.charIndex === launch.charIndex)) {
        return;
      }

      const { topLeft, endScale } = draftFlyGlyphTopLeftFromLineLayout({
        charIndex: launch.charIndex,
        layout,
        draftFontSize: launch.draftFontSize,
      });
      const { startScale } = draftFlyScaleEndpoints(
        launch.keyLabelFontSize,
        launch.draftFontSize,
        endScale,
      );
      const start = draftLetterFlyStartPoint(
        launch.keyRect,
        launch.hostOrigin,
        launch.keyLabelFontSize,
      );
      const end = draftLetterFlyEndPointFromTopLeft(topLeft, launch.hostOrigin);

      const position = new Animated.ValueXY(start);
      const scale = new Animated.Value(startScale);
      const fly: ActiveDraftFly = {
        charIndex: launch.charIndex,
        letter: launch.label,
        position,
        scale,
        fontSize: launch.draftFontSize,
        lineHeight: launch.draftLineHeight,
        letterSpacing: launch.letterSpacing,
      };

      flyStartedAtRef.current.set(launch.charIndex, Date.now());
      flyMetaRef.current.set(launch.charIndex, {
        hostOrigin: launch.hostOrigin,
        draftFontSize: launch.draftFontSize,
        keyLabelFontSize: launch.keyLabelFontSize,
      });
      setFlies((flies) => [...flies, fly]);
      animateFlyScale(scale, endScale, launch.charIndex);

      Animated.timing(position, {
        toValue: end,
        duration: DRAFT_FLY_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      scheduleFlyHandoff(launch.charIndex);
    },
    [animateFlyScale, scheduleFlyHandoff, setFlies],
  );

  const retargetFly = useCallback(
    (charIndex: number, layout: DraftLineLayout) => {
      const flyMeta = flyMetaRef.current.get(charIndex);
      const activeFly = activeFliesRef.current.find((fly) => fly.charIndex === charIndex);
      if (!flyMeta || !activeFly) {
        return;
      }

      const { topLeft, endScale } = draftFlyGlyphTopLeftFromLineLayout({
        charIndex,
        layout,
        draftFontSize: flyMeta.draftFontSize,
      });
      const end = draftLetterFlyEndPointFromTopLeft(topLeft, flyMeta.hostOrigin);
      animateFlyPosition(activeFly.position, end, charIndex);
      animateFlyScale(activeFly.scale, endScale, charIndex);
    },
    [animateFlyPosition, animateFlyScale],
  );

  const stageFlyLaunch = useCallback(
    (launch: PendingFlyLaunch) => {
      if (!enabled) {
        return;
      }
      beginCharReveal(launch.charIndex);
      pendingLaunchesRef.current.set(launch.charIndex, launch);
    },
    [beginCharReveal, enabled],
  );

  const syncFlyTargetsFromLayout = useCallback(
    (layout: DraftLineLayout) => {
      if (!enabled) {
        return;
      }
      for (const [charIndex, launch] of [...pendingLaunchesRef.current.entries()]) {
        if (layout.charCount <= charIndex) {
          continue;
        }
        pendingLaunchesRef.current.delete(charIndex);
        launchFly(launch, layout);
      }

      for (const fly of activeFliesRef.current) {
        if (layout.charCount > fly.charIndex) {
          retargetFly(fly.charIndex, layout);
        }
      }
    },
    [enabled, launchFly, retargetFly],
  );

  const resolvePendingFly = useCallback((keyIndex: number, draftLength: number) => {
    const pendingIndex = pendingFliesRef.current.findIndex(
      (pending) => pending.keyIndex === keyIndex,
    );
    if (pendingIndex < 0) {
      return null;
    }
    const [pending] = pendingFliesRef.current.splice(pendingIndex, 1);
    if (!pending || !isPendingDraftFlyValid(pending.charIndex, draftLength)) {
      return null;
    }
    return pending;
  }, []);

  const cancelCharAnimations = useCallback(
    (charIndex: number) => {
      cancelCharReveal(charIndex);
      pendingLaunchesRef.current.delete(charIndex);
      removeFly(charIndex);
    },
    [cancelCharReveal, removeFly],
  );

  const isCharRevealing = useCallback(
    (charIndex: number): boolean => {
      if (!enabled) {
        return false;
      }
      return revealingIndicesRef.current.has(charIndex);
    },
    [enabled],
  );

  return {
    activeFlies,
    revealVersion,
    stageFlyLaunch,
    syncFlyTargetsFromLayout,
    queueFlyForKey,
    resolvePendingFly,
    cancelCharAnimations,
    clearCharReveals,
    prunePendingFromCharIndex,
    isCharRevealing,
  };
}
