import { NextResponse } from 'next/server';

/**
 * Apple App Site Association (AASA) untuk Universal Links.
 *
 * URL: https://eccchurch.global/.well-known/apple-app-site-association
 *   - HARUS di-serve tanpa file extension
 *   - HARUS content-type application/json
 *   - HARUS HTTPS
 *
 * Apple crawl file ini saat app install/update untuk verify domain
 * ownership. Kalau file 404 atau MIME salah → Universal Link silent fail
 * (link tetap open di Safari, tidak buka app).
 *
 * Per backend-request-universal-links-aasa-assetlinks.md (2026-09-01).
 *
 * Team ID: RB94VQ27V3 (Gereja El Shaddai Injil Sepenuh)
 * Bundle: idea.eccchurch.global
 *
 * Path rules — see AASA const di bawah. Include /event, /ibadah, /content,
 * /renungan, /news wildcards. Exclude /persembahan (Apple compliance
 * 3.2.2(iv)) dan /event payment page. NOT prefix supported since iOS 13.
 */
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: 'RB94VQ27V3.idea.eccchurch.global',
        paths: [
          'NOT /event/*/pembayaran',
          'NOT /persembahan',
          'NOT /persembahan/*',
          '/event/*',
          '/ibadah/*',
          '/content',
          '/content/*',
          '/renungan/*',
          '/news/*',
        ],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      'Content-Type': 'application/json',
      // Apple recommend no-cache biar update cepat propagate.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
