import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useResolvedVisualEffects } from '@/hooks/useResolvedVisualEffects';
import {
  buildSpecularOpacityKeyframes,
  DEFAULT_SPECULAR_DESCENT_START,
} from '@/lib/visual/confetti-specular';
import { useVictoryConfettiStore } from '@/store/victory-confetti-store';

const PARTICLE_COUNT = 92;
const PARTICLE_SIZE = 8;
const TRAJECTORY_SAMPLES = 40;
const INTEGRATION_SUBSTEPS = 8;
/** Longest possible particle lifetime (max delay + max duration) plus a margin. */
const BURST_LIFETIME_MS = 5600;
/** Perspective for small quads so rotateX reads as a paper flip. */
const PARTICLE_PERSPECTIVE = 200;
/** Progress where rise slows and fall tumble/specular intensify. */
const DESCENT_START = DEFAULT_SPECULAR_DESCENT_START;
/** Fraction of total flip completed by descent start (slow rise tumble). */
const FLIP_MID_FRACTION = 0.2;

const CONFETTI_PAIRS: readonly [string, string][] = [
  ['#FAC775', '#F472B6'],
  ['#4ADE80', '#60A5FA'],
  ['#A78BFA', '#FBBF24'],
  ['#60A5FA', '#FAC775'],
  ['#F472B6', '#4ADE80'],
  ['#FBBF24', '#A78BFA'],
];

/** Pure white glints read better on tiny colored quads than warm/cool tints. */
const SPECULAR_COLOR = '#FFFFFF';

interface ConfettiParticle {
  id: number;
  colorA: string;
  colorB: string;
  specularColor: string;
  /** Burst origin in px (near the screen center). */
  originX: number;
  originY: number;
  size: number;
  durationMs: number;
  delayMs: number;
  spinFrom: number;
  spinTo: number;
  flipFrom: number;
  flipMid: number;
  flipTo: number;
  /** Progress samples (0..1) shared by the offset arrays below. */
  sampleInput: number[];
  /** Horizontal offset from the origin at each sample (px). */
  offsetX: number[];
  /** Vertical offset from the origin at each sample (px): negative = up. */
  offsetY: number[];
  specularInput: number[];
  specularOutput: number[];
}

/**
 * Simulate a single confetti piece with linear air drag and gravity:
 *   dvx/dt = -kx·vx
 *   dvy/dt =  g − k·vy      (y positive = down, terminal speed vt = g/k)
 * Launched fast up-and-out, it decelerates sharply near the apex (drag is
 * strong at high speed) then drifts down near the terminal speed — asymmetric,
 * unlike a symmetric parabola. Sampled at equal time steps so linear playback
 * reproduces the real timing.
 */
function simulateTrajectory(
  width: number,
  height: number,
): { offsetX: number[]; offsetY: number[]; durationSeconds: number } {
  const durationSeconds = 4.6 + Math.random() * 0.6;
  const vt = height * (0.26 + Math.random() * 0.04); // slow terminal fall (light paper)
  const k = 3.8 + Math.random() * 0.6; // strong vertical drag → quick decel
  const g = vt * k;
  const launchUp = height * (2.6 + Math.random() * 0.5); // firework-strength shot
  const kx = 2.0 + Math.random() * 0.6; // horizontal drag
  const vx0 = (Math.random() - 0.5) * width * (1.6 + Math.random() * 1.2);
  const swayAmplitude = width * (0.02 + Math.random() * 0.035);
  const swayCycles = 3 + Math.random() * 3;
  const swayPhase = Math.random();

  const dt = durationSeconds / (TRAJECTORY_SAMPLES * INTEGRATION_SUBSTEPS);
  let x = 0;
  let y = 0;
  let vx = vx0;
  let vy = -launchUp;
  const offsetX: number[] = [0];
  const offsetY: number[] = [0];
  for (let i = 1; i <= TRAJECTORY_SAMPLES * INTEGRATION_SUBSTEPS; i += 1) {
    vy += (g - k * vy) * dt;
    vx += -kx * vx * dt;
    y += vy * dt;
    x += vx * dt;
    if (i % INTEGRATION_SUBSTEPS === 0) {
      const u = i / (TRAJECTORY_SAMPLES * INTEGRATION_SUBSTEPS);
      // Flutter grows once the piece slows down and starts drifting.
      const descent = Math.min(1, Math.max(0, (u - DESCENT_START) / (1 - DESCENT_START)));
      const sway = Math.sin((u * swayCycles + swayPhase) * 2 * Math.PI) * swayAmplitude * descent;
      offsetX.push(x + sway);
      offsetY.push(y);
    }
  }
  return { offsetX, offsetY, durationSeconds };
}

function createParticles(width: number, height: number): ConfettiParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, id) => {
    const spinDir = Math.random() < 0.5 ? -1 : 1;
    const flipDir = Math.random() < 0.5 ? -1 : 1;
    const { offsetX, offsetY, durationSeconds } = simulateTrajectory(width, height);
    const sampleInput = offsetX.map((_, i) => i / TRAJECTORY_SAMPLES);
    const pair = CONFETTI_PAIRS[id % CONFETTI_PAIRS.length]!;
    const flipFrom = Math.random() * 40 * flipDir;
    const flipSpan = (720 + Math.random() * 720) * flipDir;
    const flipTo = flipFrom + flipSpan;
    const flipMid = flipFrom + flipSpan * FLIP_MID_FRACTION;
    const flashCount = 12 + Math.floor(Math.random() * 6);
    const { inputRange: specularInput, outputRange: specularOutput } =
      buildSpecularOpacityKeyframes({
        flashCount,
        phase: Math.random(),
        descentStart: DESCENT_START,
      });

    return {
      id,
      colorA: pair[0],
      colorB: pair[1],
      specularColor: SPECULAR_COLOR,
      originX: width / 2 + (Math.random() - 0.5) * width * 0.08,
      originY: height * (0.55 + Math.random() * 0.06),
      size: PARTICLE_SIZE * (0.65 + Math.random() * 0.7),
      durationMs: durationSeconds * 1000,
      // Poppers fire almost at once — only a tiny stagger.
      delayMs: Math.random() * 160,
      spinFrom: Math.random() * 360 * spinDir,
      // Faster, more varied spin for lightweight tumbling paper.
      spinTo: (420 + Math.random() * 900) * spinDir,
      flipFrom,
      flipMid,
      flipTo,
      sampleInput,
      offsetX,
      offsetY,
      specularInput,
      specularOutput,
    };
  });
}

function ConfettiParticleView({ particle }: { particle: ConfettiParticle }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: particle.durationMs,
      delay: particle.delayMs,
      // Linear time so the parabola itself carries the accel/decel feel.
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [particle, progress]);

  const translateX = progress.interpolate({
    inputRange: particle.sampleInput,
    outputRange: particle.offsetX,
  });
  const translateY = progress.interpolate({
    inputRange: particle.sampleInput,
    outputRange: particle.offsetY,
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [`${particle.spinFrom}deg`, `${particle.spinTo}deg`],
  });
  const rotateX = progress.interpolate({
    inputRange: [0, DESCENT_START, 1],
    outputRange: [`${particle.flipFrom}deg`, `${particle.flipMid}deg`, `${particle.flipTo}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.03, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });
  const specularOpacity = progress.interpolate({
    inputRange: particle.specularInput,
    outputRange: particle.specularOutput,
  });

  const faceStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: particle.size,
    height: particle.size * 0.65,
    borderRadius: 1,
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: particle.originX,
        top: particle.originY,
        width: particle.size,
        height: particle.size * 0.65,
        opacity,
        transform: [
          { perspective: PARTICLE_PERSPECTIVE },
          { translateY },
          { translateX },
          { rotate },
          { rotateX },
        ],
      }}
    >
      <View style={[faceStyle, { backgroundColor: particle.colorA }]} />
      <View
        style={[
          faceStyle,
          { backgroundColor: particle.colorB, transform: [{ rotateX: '180deg' }] },
        ]}
      />
      {/* Specular on both faces — otherwise glints vanish whenever the back side faces the camera. */}
      <Animated.View
        style={[faceStyle, { backgroundColor: particle.specularColor, opacity: specularOpacity }]}
      />
      <Animated.View
        style={[
          faceStyle,
          {
            backgroundColor: particle.specularColor,
            opacity: specularOpacity,
            transform: [{ rotateX: '180deg' }],
          },
        ]}
      />
    </Animated.View>
  );
}

/**
 * Lightweight victory confetti — a party-popper burst from the center that
 * rises, slows at the apex, and falls. Two-sided tumbling paper with specular
 * flashes. RN Animated only, no extra dependencies.
 */
export function VictoryConfetti() {
  const { width, height } = useWindowDimensions();
  const particles = useMemo(() => createParticles(width, height), [width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((particle) => (
        <ConfettiParticleView key={particle.id} particle={particle} />
      ))}
    </View>
  );
}

/**
 * Root-level confetti host. Mounted above the navigator so the burst paints
 * over the stack header too. Replays whenever `celebrate()` is called.
 */
export function VictoryConfettiHost() {
  const burstId = useVictoryConfettiStore((state) => state.burstId);
  const { victoryCelebration } = useResolvedVisualEffects();
  const [activeBurst, setActiveBurst] = useState(0);

  useEffect(() => {
    if (burstId === 0 || !victoryCelebration) {
      return undefined;
    }
    setActiveBurst(burstId);
    const timer = setTimeout(() => setActiveBurst(0), BURST_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [burstId, victoryCelebration]);

  useEffect(() => {
    if (!victoryCelebration) {
      setActiveBurst(0);
    }
  }, [victoryCelebration]);

  if (activeBurst === 0 || !victoryCelebration) {
    return null;
  }
  return <VictoryConfetti key={activeBurst} />;
}
