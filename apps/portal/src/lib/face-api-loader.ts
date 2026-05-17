/**
 * Singleton loader untuk face-api.js model weights.
 *
 * Model di-host static di /face-models (di public/face-models).
 * Total ~6 MB, hanya di-fetch sekali per page session.
 *
 * Lihat scripts/download-face-models.sh untuk cara dapat file modelnya.
 */
import * as faceapi from 'face-api.js';

const MODELS_PATH = '/face-models';

let loadPromise: Promise<typeof faceapi> | null = null;

export function loadFaceModels(): Promise<typeof faceapi> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_PATH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
    ]);
    return faceapi;
  })();

  return loadPromise;
}

/** Test apakah models sudah ter-load. Berguna untuk UI loading state. */
export function areModelsLoaded(): boolean {
  return (
    faceapi.nets.ssdMobilenetv1.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded &&
    faceapi.nets.faceRecognitionNet.isLoaded
  );
}
