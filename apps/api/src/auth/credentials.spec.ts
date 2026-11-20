import { describe, it, expect } from 'vitest';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from './credentials';

describe('credentials', () => {
  it('hashes passwords with scrypt and verifies', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('session tokens are stored only as hashes', () => {
    const { token, tokenHash } = newSessionToken();
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toContain(token);
  });
});
