import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PlatformStore } from '../store/types';
import type {
  FraudEvent,
  FraudSignal,
  FraudSignalFilter,
  FraudSurface,
  NewFraudBlock,
} from '../store/types';
import { logEvent } from '../common/logger';

/**
 * Anti-fraud service (SEC-VOT-10, SCALE s.5.5).
 *
 * Design rules:
 * - Signals are salted hashes only. Raw IPs, device fingerprints, and actor
 *   identifiers (member IDs, emails, user IDs, session tokens) are never
 *   persisted; fraud rows are never joined to ballot records (SEC-BAL-02).
 * - Shared-network NAT tolerance: IP velocity thresholds are deliberately high and
 *   IP-based actions require extreme counts; device-fingerprint correlation
 *   is the primary harvesting signal.
 * - Hard blocks require corroborated high-confidence patterns (e.g. one
 *   device fingerprint requesting OTPs for many distinct voters), never a
 *   single weak signal — legitimate low-end devices must not be excluded.
 * - Fail-open: fraud persistence/rule errors are logged and the request is
 *   allowed; an active block already in the store still rejects.
 */

export interface FraudRequestContext {
  ip?: string;
  ipClass?: 'public' | 'private';
  deviceFp?: string;
  userAgent?: string;
  uaClass?: string;
  behavior?: { dwellMs?: number; interactions?: number };
  /** Raw actor identifier — hashed with the fraud salt before any storage. */
  ref?: string;
  electionId?: string | null;
  surface: FraudSurface;
}

export interface FraudDecision {
  action: 'allow' | 'throttle' | 'block';
  score: number;
  reasons: string[];
}

interface RuleHit {
  rule: string;
  action: 'throttle' | 'block';
  score: number;
  reason: string;
  kind: 'ip' | 'device' | 'actor';
  signalHash?: string;
  block?: { scopeElection: boolean; ttlMs: number; reason: string };
}

const MIN = 60_000;
const LIFT_COOLDOWN_MS = 30 * MIN;
const SIGNAL_TTL_MS = 24 * 60 * MIN;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;

function isPrivateIp(ip: string | undefined): boolean {
  return !ip || PRIVATE_IP.test(ip);
}

export function classifyUa(ua: string | undefined): string {
  if (!ua) return 'unknown';
  const browser = /edg\//i.test(ua) ? 'edge'
    : /opr\/|opera/i.test(ua) ? 'opera'
    : /chrome|crios/i.test(ua) ? 'chrome'
    : /firefox|fxios/i.test(ua) ? 'firefox'
    : /safari/i.test(ua) ? 'safari'
    : /curl|wget|python|go-http|java\//i.test(ua) ? 'bot'
    : 'other';
  const os = /windows/i.test(ua) ? 'windows'
    : /android/i.test(ua) ? 'android'
    : /iphone|ipad|ios/i.test(ua) ? 'ios'
    : /mac os|macintosh/i.test(ua) ? 'macos'
    : /linux/i.test(ua) ? 'linux'
    : 'other';
  return `${browser}/${os}`;
}

@Injectable()
export class FraudService {
  private readonly salt: string;
  private warnedInsecureSalt = false;

  constructor(private readonly store: PlatformStore) {
    this.salt = process.env.FRAUD_HASH_SALT ?? 'votemax-dev-fraud-salt';
    if (process.env.NODE_ENV === 'production' && this.salt === 'votemax-dev-fraud-salt' && !this.warnedInsecureSalt) {
      this.warnedInsecureSalt = true;
      logEvent('warn', 'fraud.insecure_salt', { reason: 'FRAUD_HASH_SALT unset; using dev salt in production' });
    }
  }

  private hash(kind: string, raw: string): string {
    return createHash('sha256').update(`${kind}:${raw}:${this.salt}`).digest('hex');
  }

  /**
   * Evaluate one request. Returns the worst action across all fired rules.
   * Never throws for store/rule failures — fraud must not take voting down.
   */
  async evaluate(ctx: FraudRequestContext): Promise<FraudDecision> {
    try {
      return await this.evaluateInner(ctx);
    } catch (err) {
      logEvent('warn', 'fraud.evaluate_error', {
        surface: ctx.surface,
        error: err instanceof Error ? err.message : String(err),
      });
      return { action: 'allow', score: 0, reasons: [] };
    }
  }

  private async evaluateInner(ctx: FraudRequestContext): Promise<FraudDecision> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const electionId = ctx.electionId && UUID_RE.test(ctx.electionId) ? ctx.electionId : null;
    const ipPrivate = isPrivateIp(ctx.ip);
    const ipHash = ctx.ip && !ipPrivate ? this.hash('ip', ctx.ip) : null;
    const deviceHash = ctx.deviceFp ? this.hash('device', ctx.deviceFp.slice(0, 256)) : null;
    const refHash = ctx.ref ? this.hash('actor', ctx.ref.slice(0, 256)) : null;
    const uaClass = ctx.uaClass ?? classifyUa(ctx.userAgent);

    // 1. Active blocks reject before rules run. Device blocks are checked
    // election-scoped then global; IP blocks are stored global-only.
    const blockChecks: [FraudSignal['kind'], string, string | null][] = [];
    if (deviceHash) {
      blockChecks.push(['device', deviceHash, electionId], ['device', deviceHash, null]);
    }
    if (ipHash) blockChecks.push(['ip', ipHash, null], ['ip', ipHash, electionId]);
    if (refHash) blockChecks.push(['actor', refHash, null]);
    for (const [kind, signalHash, scope] of blockChecks) {
      const hit = await this.store.findActiveFraudBlock(kind, signalHash, scope);
      if (hit) {
        await this.recordEvent(electionId, 'block_hit', 100, 'block',
          [`active block ${hit.rule} until ${hit.expiresAt}`], kind, signalHash, refHash, nowIso);
        return { action: 'block', score: 100, reasons: [`active block: ${hit.rule}`] };
      }
    }

    // 2. Rule evaluation — counts cover PRIOR requests (current not yet stored).
    const hits = await this.runRules(ctx, { ipHash, deviceHash, refHash, electionId, ipPrivate, now });

    // 3. Persist new blocks for block-rules (deduped against active blocks).
    // A rule whose block was lifted within the cooldown is downgraded to a
    // throttle — lifting must give real relief, not an instant re-block.
    const blocksToAdd: NewFraudBlock[] = [];
    for (const hit of hits) {
      if (hit.action !== 'block' || !hit.block || !hit.signalHash) continue;
      const lifted = await this.store.wasFraudBlockLifted(
        hit.kind, hit.signalHash, hit.rule,
        new Date(now - LIFT_COOLDOWN_MS).toISOString(),
      );
      if (lifted) {
        hit.action = 'throttle';
        hit.score = Math.min(hit.score, 50);
        hit.reason += ' (matching block was lifted; throttling instead)';
        continue;
      }
      const scopeElection = hit.block.scopeElection ? electionId : null;
      const existing = await this.store.findActiveFraudBlock(hit.kind, hit.signalHash, scopeElection);
      if (!existing) {
        blocksToAdd.push({
          kind: hit.kind, signalHash: hit.signalHash,
          electionId: scopeElection, rule: hit.rule, reason: hit.block.reason,
          score: hit.score, expiresAt: new Date(now + hit.block.ttlMs).toISOString(),
        });
      }
    }
    for (const b of blocksToAdd) {
      try { await this.store.insertFraudBlock(b); } catch { /* non-fatal */ }
    }

    // 4. Record signals + events.
    const action: FraudDecision['action'] = hits.some((h) => h.action === 'block') ? 'block'
      : hits.some((h) => h.action === 'throttle') ? 'throttle' : 'allow';
    const score = hits.reduce((s, h) => s + h.score, 0) + (ctx.behavior?.dwellMs !== undefined && ctx.behavior.dwellMs < 2000 && ['otp_verify', 'ballot_submit', 'login'].includes(ctx.surface) ? 25 : 0);
    const reasons = hits.map((h) => h.reason);
    if (ctx.behavior?.dwellMs !== undefined && ctx.behavior.dwellMs < 2000 && ['otp_verify', 'ballot_submit', 'login'].includes(ctx.surface)) {
      reasons.push('inhuman_dwell_time');
    }

    await this.recordSignals(ctx, { ipHash, deviceHash, refHash, electionId, uaClass, action, score, nowIso });
    for (const hit of hits) {
      await this.recordEvent(electionId, hit.rule, hit.score, hit.action, [hit.reason], hit.kind, hit.signalHash ?? null, refHash, nowIso);
    }
    if (action !== 'allow') {
      logEvent('warn', 'fraud.decision', { surface: ctx.surface, action, score, rules: hits.map((h) => h.rule) });
    }
    return { action, score, reasons };
  }

  private async count(filter: Omit<FraudSignalFilter, 'since'>, now: number, windowMs: number): Promise<number> {
    return this.store.countFraudSignals({ ...filter, since: new Date(now - windowMs).toISOString() });
  }

  private async distinctRefs(filter: Omit<FraudSignalFilter, 'since'>, now: number, windowMs: number): Promise<number> {
    return this.store.countDistinctFraudRefs({ ...filter, since: new Date(now - windowMs).toISOString() });
  }

  private async runRules(
    ctx: FraudRequestContext,
    h: { ipHash: string | null; deviceHash: string | null; refHash: string | null; electionId: string | null; ipPrivate: boolean; now: number },
  ): Promise<RuleHit[]> {
    const hits: RuleHit[] = [];
    const { ipHash, deviceHash, refHash, electionId, ipPrivate, now } = h;
    const s = ctx.surface;

    const otpSurfaces = s === 'otp_request' || s === 'otp_verify';

    // ---- Ballot harvesting: one device/IP serving many voters ----
    if (s === 'otp_request' && deviceHash && electionId) {
      const refs = await this.distinctRefs({ kind: 'device', signalHash: deviceHash, electionId, surface: s }, now, 10 * MIN);
      if (refs >= 5) {
        hits.push({
          rule: 'otp_harvest_device', action: 'block', score: 100,
          reason: `device requested OTPs for ${refs} distinct voters in 10m`,
          kind: 'device', signalHash: deviceHash,
          block: { scopeElection: true, ttlMs: 2 * 60 * MIN, reason: 'OTP harvesting pattern' },
        });
      }
      // Cross-election sweep: same device burning OTP requests across many
      // elections (electionId omitted = any election). High threshold — a
      // shared family/dorm device legitimately votes in a handful.
      const sweep = await this.count({ kind: 'device', signalHash: deviceHash, surface: s }, now, 60 * MIN);
      if (sweep >= 15) {
        hits.push({
          rule: 'otp_sweep_device', action: 'block', score: 100,
          reason: `device issued ${sweep} OTP requests across elections in 1h`,
          kind: 'device', signalHash: deviceHash,
          block: { scopeElection: false, ttlMs: 2 * 60 * MIN, reason: 'Cross-election OTP sweep' },
        });
      }
    }
    if (s === 'otp_verify' && deviceHash && electionId) {
      const refs = await this.distinctRefs({ kind: 'device', signalHash: deviceHash, electionId, surface: s }, now, 10 * MIN);
      if (refs >= 8) {
        hits.push({
          rule: 'otp_verify_sweep_device', action: 'block', score: 90,
          reason: `device verified OTPs for ${refs} distinct voters in 10m`,
          kind: 'device', signalHash: deviceHash,
          block: { scopeElection: true, ttlMs: 60 * MIN, reason: 'OTP verification sweep' },
        });
      }
    }

    // ---- OTP velocity (per-actor and per-IP; IP thresholds shared-network safe) ----
    if (otpSurfaces && refHash && electionId) {
      const n = await this.count({ kind: 'actor', signalHash: refHash, electionId, surface: 'otp_request' }, now, 60 * MIN);
      if (s === 'otp_request' && n > 6) {
        hits.push({ rule: 'otp_actor_velocity', action: 'throttle', score: 40, reason: `voter OTP requests ${n}/h exceed threshold`, kind: 'actor', signalHash: refHash });
      }
    }
    if (s === 'otp_request' && ipHash && electionId && !ipPrivate) {
      const n = await this.count({ kind: 'ip', signalHash: ipHash, electionId, surface: s }, now, 10 * MIN);
      if (n > 40) hits.push({ rule: 'ip_otp_flood', action: 'throttle', score: 30, reason: `IP issued ${n} OTP requests/10m`, kind: 'ip', signalHash: ipHash });
      const refs = await this.distinctRefs({ kind: 'ip', signalHash: ipHash, electionId, surface: s }, now, 10 * MIN);
      if (refs >= 20) hits.push({ rule: 'ip_otp_sweep', action: 'throttle', score: 50, reason: `IP touched ${refs} distinct voters/10m`, kind: 'ip', signalHash: ipHash });
    }

    // ---- Login stuffing ----
    if (s === 'login') {
      if (ipHash && !ipPrivate) {
        const n5 = await this.count({ kind: 'ip', signalHash: ipHash, surface: s }, now, 5 * MIN);
        if (n5 >= 150) {
          hits.push({
            rule: 'login_stuffing_ip', action: 'block', score: 100,
            reason: `${n5} login attempts/5m from one IP`,
            kind: 'ip', signalHash: ipHash,
            block: { scopeElection: false, ttlMs: 15 * MIN, reason: 'Credential stuffing pattern' },
          });
        } else if (n5 >= 30) {
          hits.push({ rule: 'login_ip_flood', action: 'throttle', score: 35, reason: `${n5} login attempts/5m from one IP`, kind: 'ip', signalHash: ipHash });
        }
      }
      if (deviceHash) {
        const refs = await this.distinctRefs({ kind: 'device', signalHash: deviceHash, surface: s }, now, 10 * MIN);
        if (refs >= 5) {
          hits.push({
            rule: 'login_stuffing_device', action: 'block', score: 100,
            reason: `device attempted logins for ${refs} distinct accounts/10m`,
            kind: 'device', signalHash: deviceHash,
            block: { scopeElection: false, ttlMs: 60 * MIN, reason: 'Multi-account login stuffing' },
          });
        }
      }
    }

    // ---- Ballot submission abuse ----
    if (s === 'ballot_submit' && electionId) {
      if (refHash) {
        const n = await this.count({ kind: 'actor', signalHash: refHash, electionId, surface: s }, now, 5 * MIN);
        if (n > 3) hits.push({ rule: 'submit_replay', action: 'throttle', score: 45, reason: `${n} ballot submissions/5m for one session`, kind: 'actor', signalHash: refHash });
      }
      if (deviceHash) {
        const n = await this.count({ kind: 'device', signalHash: deviceHash, electionId, surface: s }, now, 5 * MIN);
        if (n > 50) hits.push({ rule: 'submit_flood', action: 'throttle', score: 40, reason: `${n} ballot submissions/5m from one device`, kind: 'device', signalHash: deviceHash });
      }
    }
    if (s === 'ballot_fetch' && deviceHash && electionId) {
      const n = await this.count({ kind: 'device', signalHash: deviceHash, electionId, surface: s }, now, 5 * MIN);
      if (n > 100) hits.push({ rule: 'ballot_fetch_flood', action: 'throttle', score: 30, reason: `${n} ballot fetches/5m from one device`, kind: 'device', signalHash: deviceHash });
    }

    // ---- Admin / privileged-surface velocity ----
    if (['register_import', 'provision', 'user_create', 'role_assign', 'org_create'].includes(s) && refHash) {
      const windowMs = s === 'register_import' ? 60 * MIN : 10 * MIN;
      const limit = s === 'register_import' ? 5 : 30;
      const n = await this.count({ kind: 'actor', signalHash: refHash, surface: s }, now, windowMs);
      if (n > limit) hits.push({ rule: `${s}_velocity`, action: 'throttle', score: 35, reason: `${n} ${s} calls in window`, kind: 'actor', signalHash: refHash });
    }
    if (s === 'mutation' && refHash) {
      const n = await this.count({ kind: 'actor', signalHash: refHash, surface: 'mutation' }, now, 5 * MIN);
      if (n > 120) hits.push({ rule: 'mutation_flood', action: 'throttle', score: 30, reason: `${n} mutations/5m`, kind: 'actor', signalHash: refHash });
    }

    return hits;
  }

  private async recordSignals(
    ctx: FraudRequestContext,
    h: { ipHash: string | null; deviceHash: string | null; refHash: string | null; electionId: string | null; uaClass: string; action: FraudDecision['action']; score: number; nowIso: string },
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + SIGNAL_TTL_MS).toISOString();
    const rows: FraudSignal[] = [];
    const base = {
      electionId: h.electionId, refHash: h.refHash, surface: ctx.surface,
      uaClass: h.uaClass, score: h.score, action: h.action,
      meta: ctx.behavior ? { dwellMs: ctx.behavior.dwellMs ?? null, interactions: ctx.behavior.interactions ?? null } : null,
      createdAt: h.nowIso, expiresAt,
    };
    if (h.ipHash) rows.push({ ...base, kind: 'ip', signalHash: h.ipHash });
    if (h.deviceHash) rows.push({ ...base, kind: 'device', signalHash: h.deviceHash });
    if (h.refHash) rows.push({ ...base, kind: 'actor', signalHash: h.refHash, refHash: null });
    for (const row of rows) {
      try { await this.store.insertFraudSignal(row); } catch { /* non-fatal */ }
    }
  }

  private async recordEvent(
    electionId: string | null, rule: string, score: number, action: FraudEvent['action'],
    reasons: string[], kind: FraudEvent['signalKind'], signalHash: string | null, refHash: string | null, nowIso: string,
  ): Promise<void> {
    const event: FraudEvent = {
      electionId, rule, score, action, reasons,
      signalKind: kind, signalHash, refHash, createdAt: nowIso,
    };
    try { await this.store.insertFraudEvent(event); } catch { /* non-fatal */ }
  }
}
