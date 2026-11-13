import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AuthController, PlatformController } from './platform/platform.controller';
import { PlatformAdminController } from './platform/platform-admin.controller';
import { PlatformService } from './platform/platform.service';
import { InMemoryStore } from './store/memory.store';
import { PostgresStore } from './store/postgres.store';
import { PLATFORM_STORE, type PlatformStore } from './store/types';
import { OtpDelivery } from './otp/otp-delivery';
import { FraudService } from './fraud/fraud.service';
import { FraudInterceptor } from './fraud/fraud.interceptor';
import { logEvent } from './common/logger';

function createStore(): PlatformStore {
  if (process.env.DATABASE_URL) {
    logEvent('info', 'store.selected', { store: 'postgres' });
    return new PostgresStore();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production (F-01: no in-memory store)');
  }
  logEvent('warn', 'store.selected', { store: 'memory', reason: 'DATABASE_URL not set; not durable' });
  return new InMemoryStore();
}

@Module({
  controllers: [HealthController, PlatformController, PlatformAdminController, AuthController],
  providers: [
    { provide: PLATFORM_STORE, useFactory: createStore },
    {
      provide: PlatformService,
      useFactory: (store: PlatformStore) => new PlatformService(store, new OtpDelivery()),
      inject: [PLATFORM_STORE],
    },
    OtpDelivery,
    { provide: FraudService, useFactory: (store: PlatformStore) => new FraudService(store), inject: [PLATFORM_STORE] },
    { provide: APP_INTERCEPTOR, useClass: FraudInterceptor },
  ],
})
export class AppModule {}
