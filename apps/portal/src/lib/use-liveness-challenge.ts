/**
 * State machine untuk menjalankan urutan challenge liveness.
 *
 * Flow:
 *   idle → [challenge 1] → [challenge 2] → verified
 *
 * Setiap challenge punya deadline (default 15 detik) — jika tidak selesai,
 * pindah ke `failed` dan UI bisa offer restart.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { FaceLandmarks68 } from 'face-api.js';
import {
  BlinkDetector,
  computeBothEyesEAR,
  detectHeadDirection,
  pickRandomChallenges,
  type ChallengeKind,
  type HeadDirection,
} from './liveness';

export type LivenessState =
  | { status: 'idle' }
  | { status: 'running'; currentIndex: number; deadline: number }
  | { status: 'verified' }
  | { status: 'failed'; reason: string };

interface Options {
  /** Timeout per challenge, ms. Default 15_000. */
  perChallengeMs?: number;
}

export function useLivenessChallenge(opts: Options = {}) {
  const perChallengeMs = opts.perChallengeMs ?? 15_000;

  const [challenges, setChallenges] = useState<ChallengeKind[]>([]);
  const [state, setState] = useState<LivenessState>({ status: 'idle' });

  // Detector instances per challenge run
  const blinkRef = useRef<BlinkDetector | null>(null);
  // Track berapa kali consecutive frame mendeteksi direction yang dituju (anti false-positive)
  const directionStreakRef = useRef<{ direction: HeadDirection; count: number }>({ direction: 'center', count: 0 });

  const current = useMemo(
    () => (state.status === 'running' ? challenges[state.currentIndex] : null),
    [state, challenges],
  );

  /** Start challenge sequence baru (pick random). */
  const start = useCallback(() => {
    const picked = pickRandomChallenges();
    setChallenges(picked);
    blinkRef.current = new BlinkDetector();
    directionStreakRef.current = { direction: 'center', count: 0 };
    setState({ status: 'running', currentIndex: 0, deadline: Date.now() + perChallengeMs });
  }, [perChallengeMs]);

  /** Reset semuanya ke idle. */
  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setChallenges([]);
    blinkRef.current = null;
  }, []);

  /**
   * Feed landmarks per frame. Hook akan auto-advance kalau challenge passed,
   * atau pindah ke `failed` saat timeout.
   */
  const observe = useCallback(
    (landmarks: FaceLandmarks68 | null) => {
      if (state.status !== 'running' || !current) return;

      const now = Date.now();
      if (now > state.deadline) {
        setState({ status: 'failed', reason: 'Waktu habis untuk challenge ini' });
        return;
      }
      if (!landmarks) return;

      let passed = false;

      if (current.kind === 'blink') {
        const ear = computeBothEyesEAR(landmarks);
        blinkRef.current?.observe(ear, now);
        if ((blinkRef.current?.count ?? 0) >= current.required) {
          passed = true;
        }
      } else {
        const target: HeadDirection = current.kind === 'turn-left' ? 'left' : 'right';
        const detected = detectHeadDirection(landmarks);
        const streak = directionStreakRef.current;
        if (detected === target) {
          if (streak.direction === target) streak.count += 1;
          else directionStreakRef.current = { direction: target, count: 1 };
        } else {
          directionStreakRef.current = { direction: 'center', count: 0 };
        }
        // Butuh 3 frame consecutive supaya tidak false-positive
        if (directionStreakRef.current.count >= 3) passed = true;
      }

      if (passed) {
        const nextIndex = state.currentIndex + 1;
        // Reset detectors untuk next challenge
        blinkRef.current = new BlinkDetector();
        directionStreakRef.current = { direction: 'center', count: 0 };

        if (nextIndex >= challenges.length) {
          setState({ status: 'verified' });
        } else {
          setState({ status: 'running', currentIndex: nextIndex, deadline: Date.now() + perChallengeMs });
        }
      }
    },
    [state, current, challenges.length],
  );

  return {
    state,
    current,
    challenges,
    total: challenges.length,
    start,
    reset,
    observe,
  };
}
