/**
 * Liveness detection helpers — passive challenges berbasis face landmarks.
 *
 * Threat model yang di-mitigasi:
 *   - Replay foto statik (paling umum, paling murah untuk attacker)
 *   - Foto cetak di-pegang depan kamera
 *
 * Threat model yang TIDAK di-cover (perlu tooling lebih advanced):
 *   - Video deepfake real-time
 *   - 3D mask
 *   - Replay video high-quality
 *
 * Untuk MVP, kombinasi blink + head turn cukup raises the bar dari serangan
 * trivial. Untuk production tinggi-risiko, integrasikan dengan AWS Rekognition
 * Liveness atau Azure Face Liveness API.
 */

import type { FaceLandmarks68, Point } from 'face-api.js';

// =====================================================
//  Eye Aspect Ratio (blink detection)
// =====================================================
//
// Berdasarkan paper "Real-Time Eye Blink Detection using Facial Landmarks"
// (Soukupová & Čech, 2016). EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
//
// Untuk mata terbuka, EAR ~ 0.3. Saat tertutup, EAR drop ke ~0.1-0.15.
// Blink = transition EAR open → closed → open dalam < 400 ms.

const EAR_CLOSED_THRESHOLD = 0.21;
const EAR_OPEN_THRESHOLD = 0.27;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(eye: Point[]): number {
  // Expect 6 points: p1 (outer corner), p2-p3 (top), p4 (inner corner), p5-p6 (bottom)
  if (eye.length !== 6) return 0;
  const vertical = dist(eye[1]!, eye[5]!) + dist(eye[2]!, eye[4]!);
  const horizontal = dist(eye[0]!, eye[3]!);
  return horizontal === 0 ? 0 : vertical / (2 * horizontal);
}

export function computeBothEyesEAR(landmarks: FaceLandmarks68): number {
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  return (eyeAspectRatio(left) + eyeAspectRatio(right)) / 2;
}

/**
 * Stateful blink detector. Pakai instance baru per challenge.
 * Track transisi open → closed → open dalam window <= 500ms.
 */
export class BlinkDetector {
  private state: 'open' | 'closing' | 'closed' = 'open';
  private closedAt: number | null = null;
  private blinkCount = 0;

  /** Feed EAR sample. Return true jika baru saja terjadi 1 blink. */
  observe(ear: number, now = Date.now()): boolean {
    let blinkJustHappened = false;

    if (this.state === 'open' && ear < EAR_CLOSED_THRESHOLD) {
      this.state = 'closed';
      this.closedAt = now;
    } else if (this.state === 'closed' && ear > EAR_OPEN_THRESHOLD) {
      const duration = this.closedAt ? now - this.closedAt : 0;
      // Valid blink: 80-500 ms. Lebih cepat = false positive, lebih lama = kelopak nutup lama (bukan blink natural)
      if (duration >= 80 && duration <= 500) {
        this.blinkCount += 1;
        blinkJustHappened = true;
      }
      this.state = 'open';
      this.closedAt = null;
    }

    return blinkJustHappened;
  }

  get count(): number {
    return this.blinkCount;
  }
  reset(): void {
    this.state = 'open';
    this.closedAt = null;
    this.blinkCount = 0;
  }
}

// =====================================================
//  Head Pose (yaw) — turn left/right detection
// =====================================================
//
// Heuristic sederhana: hitung posisi nose tip (landmark 30) relatif ke
// outer eye corners. Saat menghadap depan, nose tip berada di tengah antara
// kedua mata. Saat tengok kanan, nose tip lebih dekat ke mata kanan
// (dari perspektif pemilik wajah → "left eye corner" karena cermin).

export type HeadDirection = 'left' | 'right' | 'center';

/**
 * Estimasi arah hadap. Threshold yaw ratio:
 *   < 0.35  → tengok ke kiri (dari kamera = head turned right)
 *   > 0.65  → tengok ke kanan
 *   else    → menghadap depan
 *
 * Catatan: video di-mirror (`scaleX(-1)`) di UI, jadi label direction
 * sengaja sesuai instruksi UI user ("tengok kanan" dari sudut pandang user).
 */
const TURN_LEFT_RATIO = 0.35;
const TURN_RIGHT_RATIO = 0.65;

export function detectHeadDirection(landmarks: FaceLandmarks68): HeadDirection {
  const nose = landmarks.getNose()[3];                 // titik puncak hidung
  const leftEye = landmarks.getLeftEye()[0];           // outer corner left eye
  const rightEye = landmarks.getRightEye()[3];         // outer corner right eye

  if (!nose || !leftEye || !rightEye) return 'center';

  const eyeSpan = rightEye.x - leftEye.x;
  if (eyeSpan <= 0) return 'center';

  // Ratio dari nose-x dalam rentang [leftEye.x, rightEye.x]
  const ratio = (nose.x - leftEye.x) / eyeSpan;

  // Video di-mirror, swap label supaya cocok dengan instruksi UI
  if (ratio < TURN_LEFT_RATIO) return 'right';  // user tengok ke kanan
  if (ratio > TURN_RIGHT_RATIO) return 'left';  // user tengok ke kiri
  return 'center';
}

// =====================================================
//  Challenge types
// =====================================================

export type ChallengeKind =
  | { kind: 'blink'; required: number; label: string }
  | { kind: 'turn-left'; label: string }
  | { kind: 'turn-right'; label: string };

/** Pick 2 random challenges yang berbeda. */
export function pickRandomChallenges(): ChallengeKind[] {
  const pool: ChallengeKind[] = [
    { kind: 'blink', required: 2, label: 'Kedipkan mata 2 kali' },
    { kind: 'turn-left', label: 'Tengokkan kepala ke kiri' },
    { kind: 'turn-right', label: 'Tengokkan kepala ke kanan' },
  ];
  // Shuffle dan ambil 2 pertama
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 2);
}
