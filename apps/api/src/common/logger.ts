/**
 * Structured logger with privacy redaction (SEC-BAL-03/04, EMP-ARCH-001 s.17).
 * Ballot-path bodies, selections, OTPs, and tokens must never be logged.
 * The redactor drops known-sensitive keys anywhere in the payload.
 */
const SENSITIVE_KEYS = new Set([
  'selections',
  'ballot',
  'ballotcontent',
  'otp',
  'code',
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

export function logEvent(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export { redact };
