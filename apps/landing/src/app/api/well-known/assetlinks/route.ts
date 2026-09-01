import { NextResponse } from 'next/server';

/**
 * Android App Links assetlinks.json — Digital Asset Links.
 *
 * URL: https://eccchurch.global/.well-known/assetlinks.json
 *   - Content-Type application/json
 *   - HTTPS only
 *
 * Android verify saat app install (kalau `autoVerify: true` di intent
 * filter). Kalau file missing → Android tampil chooser "Open with…"
 * instead of langsung buka app.
 *
 * Per backend-request-universal-links-aasa-assetlinks.md (2026-09-01).
 *
 * Package: idea.eccchurch.global
 *
 * SHA256 fingerprints — WAJIB include DUA:
 *   1. Upload key (mobile team local keystore)
 *   2. Play App Signing key (Play Console → Setup → App Integrity)
 *
 * Env override supaya rotate/update tanpa deploy code:
 *   ANDROID_ASSETLINKS_SHA256_UPLOAD=AA:BB:CC:...
 *   ANDROID_ASSETLINKS_SHA256_PLAY=DD:EE:FF:...
 *
 * Kalau env kosong → pakai placeholder (dev fallback). Production WAJIB set.
 */
function getFingerprints(): string[] {
  const list = [
    process.env.ANDROID_ASSETLINKS_SHA256_UPLOAD,
    process.env.ANDROID_ASSETLINKS_SHA256_PLAY,
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  if (list.length > 0) return list;
  // Placeholder — production akan reject verification. Wajib set env.
  return ['PLACEHOLDER_SET_ANDROID_ASSETLINKS_SHA256_UPLOAD_AND_PLAY'];
}

export function GET() {
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'idea.eccchurch.global',
        sha256_cert_fingerprints: getFingerprints(),
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
