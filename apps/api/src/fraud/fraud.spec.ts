import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../store/memory.store';
import { FraudService, type FraudRequestContext } from './fraud.service';

function ctx(over: Partial<FraudRequestContext> = {}): FraudRequestContext {
  return {
    ip: '197.215.1.1',
    deviceFp: 'fp-abc',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
    ref: 'voter-1',
    electionId: randomUUID(),
    surface: 'otp_request',
    ...over,
  };
}

async function hit(svc: FraudService, n: number, base: FraudRequestContext): Promise<void> {
  for (let i = 0; i < n; i++) await svc.evaluate(base);
}

describe('FraudService (SEC-VOT-10)', () => {
  it('allows a normal request and records hashed signals only', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const electionId = randomUUID();
    const d = await svc.evaluate(ctx({ electionId, ref: 'S001', ip: '197.215.1.1', deviceFp: 'fp-x' }));
    expect(d.action).toBe('allow');
    expect(store.fraudSignals.length).toBe(3); // ip + device + actor
    const raw = JSON.stringify(store.fraudSignals);
    expect(raw).not.toContain('197.215.1.1');
    expect(raw).not.toContain('fp-x');
    expect(raw).not.toContain('S001');
    for (const s of store.fraudSignals) expect(s.signalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks a device harvesting OTPs for many distinct voters', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const electionId = randomUUID();
    const fp = 'harvester-fp';
    // 5 prior distinct voters on same device+election; the 6th trips the rule.
    for (let i = 1; i <= 5; i++) {
      await svc.evaluate(ctx({ electionId, deviceFp: fp, ref: `voter-${i}` }));
    }
    const d = await svc.evaluate(ctx({ electionId, deviceFp: fp, ref: 'voter-6' }));
    expect(d.action).toBe('block');
    expect(d.reasons.join(' ')).toMatch(/otp_harvest_device|distinct voters/);
    expect(store.fraudBlocks.some((b) => b.rule === 'otp_harvest_device' && b.electionId === electionId)).toBe(true);
    // Subsequent requests hit the active block.
    const again = await svc.evaluate(ctx({ electionId, deviceFp: fp, ref: 'voter-7' }));
    expect(again.action).toBe('block');
    expect(store.fraudEvents.some((e) => e.rule === 'block_hit')).toBe(true);
  });

  it('does not block a shared campus IP with many voters but few per device', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const electionId = randomUUID();
    const ip = '197.215.9.9'; // campus NAT
    // 25 distinct voters behind one IP, each on their own device — under the
    // 20-distinct-IP sweep threshold? No: 25 >= 20 → throttle, never block.
    for (let i = 1; i <= 25; i++) {
      const d = await svc.evaluate(ctx({ electionId, ip, deviceFp: `dev-${i}`, ref: `voter-${i}` }));
      expect(d.action).not.toBe('block');
    }
    const last = await svc.evaluate(ctx({ electionId, ip, deviceFp: 'dev-26', ref: 'voter-26' }));
    expect(last.action).toBe('throttle'); // ip_otp_sweep fires, not a block
    expect(store.fraudBlocks.length).toBe(0);
  });

  it('throttles per-voter OTP velocity without blocking', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const electionId = randomUUID();
    let sawThrottle = false;
    for (let i = 0; i < 9; i++) {
      const d = await svc.evaluate(ctx({ electionId, ref: 'S001', deviceFp: `dev-${i}` }));
      if (d.action === 'throttle') sawThrottle = true;
      expect(d.action).not.toBe('block');
    }
    expect(sawThrottle).toBe(true);
    expect(store.fraudBlocks.length).toBe(0);
  });

  it('blocks credential stuffing across accounts from one device on login', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const fp = 'stuffing-fp';
    for (let i = 1; i <= 5; i++) {
      await svc.evaluate(ctx({ surface: 'login', electionId: null, deviceFp: fp, ref: `acct-${i}@x.edu`, ip: '8.8.8.8' }));
    }
    const d = await svc.evaluate(ctx({ surface: 'login', electionId: null, deviceFp: fp, ref: 'acct-6@x.edu', ip: '8.8.8.8' }));
    expect(d.action).toBe('block');
    const block = store.fraudBlocks.find((b) => b.rule === 'login_stuffing_device');
    expect(block?.electionId).toBeNull(); // global scope
    // Global block now rejects even without device fp? No — blocks are per-signal.
    const other = await svc.evaluate(ctx({ surface: 'login', electionId: null, deviceFp: 'clean-fp', ref: 'acct-7@x.edu', ip: '1.1.1.1' }));
    expect(other.action).not.toBe('block');
  });

  it('exempts private/loopback IPs from IP-based rules', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    for (let i = 0; i < 100; i++) {
      const d = await svc.evaluate(ctx({ ip: '127.0.0.1', deviceFp: `d${i}`, ref: `r${i}`, electionId: null, surface: 'login' }));
      expect(d.action).not.toBe('throttle');
    }
  });

  it('lifts a block and allows the signal again', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const electionId = randomUUID();
    const fp = 'lift-me';
    for (let i = 1; i <= 6; i++) {
      await svc.evaluate(ctx({ electionId, deviceFp: fp, ref: `v-${i}` }));
    }
    const block = store.fraudBlocks.find((b) => b.rule === 'otp_harvest_device')!;
    expect(await store.liftFraudBlock(block.id, 'admin-1')).toBe(true);
    const d = await svc.evaluate(ctx({ electionId, deviceFp: fp, ref: 'v-7' }));
    // Rule may re-fire on prior signals, but block_hit must not appear.
    expect(store.fraudEvents.filter((e) => e.rule === 'block_hit').length).toBe(0);
    expect(d.action).not.toBe('block');
  });

  it('ignores invalid election ids and never stores raw behavior secrets', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const d = await svc.evaluate(ctx({ electionId: 'not-a-uuid', surface: 'otp_request' }));
    expect(d.action).toBe('allow');
    for (const s of store.fraudSignals) expect(s.electionId).toBeNull();
  });

  it('records but does not block on inhuman dwell time alone', async () => {
    const store = new InMemoryStore();
    const svc = new FraudService(store);
    const d = await svc.evaluate(ctx({
      surface: 'ballot_submit', electionId: randomUUID(), ref: 'bs:tok',
      behavior: { dwellMs: 100, interactions: 0 },
    }));
    expect(d.action).toBe('allow');
    expect(d.score).toBeGreaterThanOrEqual(25);
    expect(d.reasons).toContain('inhuman_dwell_time');
  });
});
