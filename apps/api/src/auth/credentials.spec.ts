import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  hashPassword,
  totpCode,
  verifyPassword,
  verifyTotp,
} from './credentials';

describe('credentials (FR-IAM-001 support)', () => {
  it('hashes passwords with scrypt and verifies', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('TOTP accepts current code and rejects wrong code', () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(code === '000000');
  });

  it('TOTP matches RFC 6238 test vector (SHA1, T=59s)', () => {
    // RFC 6238 Appendix B: ASCII seed "12345678901234567890", T=59 -> 94287082 (8-digit).
    const asciiSecret = Buffer.from('12345678901234567890').toString('binary');
    // Encode seed as base32 manually for the test.
    const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0, b32 = '';
    for (const byte of Buffer.from(asciiSecret)) {
      value = (value << 8) | byte; bits += 8;
      while (bits >= 5) { b32 += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) b32 += B32[(value << (5 - bits)) & 31];
    expect(totpCode(b32, 59000, 8)).toBe('94287082');
  });
});
