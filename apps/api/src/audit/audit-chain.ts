import { createHash } from 'node:crypto';

export interface AuditEntryInput {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  scope: string;
  outcome: string;
  createdAt: string;
}

export interface AuditEntry extends AuditEntryInput {
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

function canonical(entry: AuditEntryInput & { prevHash: string }): string {
  return [
    entry.prevHash,
    entry.organizationId ?? '',
    entry.actorId ?? '',
    entry.action,
    entry.scope,
    entry.outcome,
    entry.createdAt,
  ].join('|');
}

export function computeHash(entry: AuditEntryInput & { prevHash: string }): string {
  return createHash('sha256').update(canonical(entry)).digest('hex');
}

export function appendEntry(chain: AuditEntry[], input: AuditEntryInput): AuditEntry {
  const prevHash = chain.length === 0 ? GENESIS_HASH : chain[chain.length - 1].hash;
  const entry: AuditEntry = { ...input, prevHash, hash: '' };
  entry.hash = computeHash(entry);
  return entry;
}

/** Returns index of first broken link, or -1 when the chain verifies. */
export function verifyChain(chain: AuditEntry[]): number {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (entry.prevHash !== prevHash) return i;
    if (entry.hash !== computeHash(entry)) return i;
    prevHash = entry.hash;
  }
  return -1;
}
