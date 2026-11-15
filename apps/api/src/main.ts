import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';

// Env files, most-specific first (.env.local overrides .env; app dir beats repo root).
loadEnv({ path: ['.env.local', '../../.env.local', '.env', '../../.env'], quiet: true });
import { AppModule } from './app.module';
import { logEvent } from './common/logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Voter-register CSV imports carry the whole file in one JSON body -
  // the 100kb default cannot hold a 10k-row register. This runs before
  // Nest's own parser, which then skips the already-parsed body.
  app.use(json({ limit: '8mb' }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  // Security headers on every API response; API returns JSON only.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port);
  logEvent('info', 'api.started', { port });
}

void bootstrap();
