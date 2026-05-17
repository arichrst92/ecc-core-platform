import 'dotenv/config';
// PENTING: patch Express 4 supaya async handler yang throw error otomatis
// di-forward ke errorHandler middleware. Tanpa ini, request akan hang.
import 'express-async-errors';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`🚀 ECC Core API running on http://localhost:${PORT}`);
    logger.info(`📚 API docs: http://localhost:${PORT}/docs`);
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
});
