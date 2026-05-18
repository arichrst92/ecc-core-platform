import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import {
  adminLimiter,
  publicApiLimiter,
  uploadLimiter,
  globalLimiter,
} from './middleware/rate-limit.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin/index.js';
import { publicRouter } from './routes/public/index.js';
import { uploadRouter } from './routes/upload.js';
import { openApiSpec } from './openapi.js';
import { UPLOADS_DIR, PUBLIC_UPLOADS_PREFIX } from './lib/storage.js';

export function createApp(): Express {
  const app = express();

  // ---------- Security & infra middleware ----------
  app.use(helmet());
  // CORS — dev mode allow semua localhost origin, prod mode strict whitelist
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3100')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  // ---------- Health & docs ----------
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'core-api', timestamp: new Date().toISOString() });
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // ---------- Static uploads ----------
  // Serve foto profil dari VPS filesystem.
  // Production: pertimbangkan reverse-proxy (Nginx/Caddy) langsung serve folder ini
  // tanpa lewat Node, untuk performa lebih baik dan offload bandwidth.
  app.use(
    PUBLIC_UPLOADS_PREFIX,
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      immutable: false,
      fallthrough: true,
      setHeaders: (res) => {
        // Allow cross-origin <img> dari portal (port 3100 ↔ core-api 4100).
        // Helmet default Cross-Origin-Resource-Policy=same-origin akan blocked.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }),
  );

  // ---------- Routes (dengan rate limiting per kategori) ----------
  // Auth: per-endpoint limiter di dalam authRouter (lihat routes/auth.ts)
  app.use('/auth', authRouter);

  // Admin endpoints — moderate per-user limit.
  app.use('/admin', adminLimiter, adminRouter);

  // Upload — tighter limit karena resource-heavy.
  app.use('/upload', uploadLimiter, uploadRouter);

  // Public/consumer endpoints — auth via API key, limit per API key.
  app.use('/api/v1', publicApiLimiter, publicRouter);

  // Fallback global limiter untuk endpoint lain (mis. /health di luar trust)
  app.use(globalLimiter);

  // ---------- Error handling ----------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
