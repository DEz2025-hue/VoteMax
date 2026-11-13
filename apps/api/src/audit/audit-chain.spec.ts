import { describe, it, expect } from 'vitest';
import { appendEntry, verifyChain, type AuditEntry } from './audit-chain';

function entry(action: string) {
  return {
    organizationId: 'org-1',
    actorId: 'user-1',
    action,
    scope: 'election:e1',
    outcome: 'success',
    createdAt: '2026-11-11T10:00:00.000Z',
  };
}

describe('audit hash chain (SEC-AUD-02)', () => {
  it('verifies a well-formed chain', () => {
    const chain: AuditEntry[] = [];
    chain.push(appendEntry(chain, entry('election.create')));
    chain.push(appendEntry(chain, entry('register.freeze')));
    expect(verifyChain(chain)).toBe(-1);
  });

  it('detects tampering with a recorded action', () => {
    const chain: AuditEntry[] = [];
    chain.push(appendEntry(chain, entry('election.create')));
    chain.push(appendEntry(chain, entry('tally.execute')));
    chain[0] = { ...chain[0], action: 'election.delete' };
    expect(verifyChain(chain)).toBe(0);
  });

  it('detects a rewritten prev-hash link', () => {
    const chain: AuditEntry[] = [];
    chain.push(appendEntry(chain, entry('role.grant')));
    chain.push(appendEntry(chain, entry('role.revoke')));
    chain[1] = { ...chain[1], prevHash: 'f'.repeat(64) };
    expect(verifyChain(chain)).toBe(1);
  });

  it('never carries ballot selections by construction', () => {
    const e = appendEntry([], entry('ballot.accept'));
    expect(Object.keys(e)).not.toContain('selections');
    expect(Object.keys(e)).not.toContain('ballotContent');
  });
});
