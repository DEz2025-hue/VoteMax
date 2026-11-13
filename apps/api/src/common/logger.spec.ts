import { describe, it, expect } from 'vitest';
import { redact } from './logger';

describe('log redaction (SEC-BAL-03/04)', () => {
  it('redacts selections, OTPs and tokens at any depth', () => {
    const out = redact({
      event: 'ballot.submit',
      selections: ['cand-1'],
      nested: { otp: '123456', note: 'ok' },
      headers: { authorization: 'Bearer x' },
    }) as Record<string, unknown>;
    expect(out.selections).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).otp).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).note).toBe('ok');
    expect((out.headers as Record<string, unknown>).authorization).toBe('[REDACTED]');
  });
});
