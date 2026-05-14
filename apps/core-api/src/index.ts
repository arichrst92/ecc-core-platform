import 'dotenv/config';
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
