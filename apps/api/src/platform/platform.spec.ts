import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';
import { signIn } from './test-signin';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let registrarId: string;
let adminId: string;

function setupElection() {
  return svc.createElection(adminId, orgId, {
    name: 'Organization Election 2026',
    votingOpensAt: '2026-12-01T08:00:00Z',
    votingClosesAt: '2026-12-01T16:00:00Z',
  });
}

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Example Organization', 'example')).id;
  registrarId = (await svc.createUser(orgId, 'registrar@example.org', 'Regina Registrar', 'correct horse battery')).id;
  adminId = (await svc.createUser(orgId, 'admin@example.org', 'Adam Admin', 'correct horse battery')).id;
});

describe('Phase 2 core workflows', () => {
  it('configures an election through lifecycle to READY', async () => {
    const election = await setupElection();
    await svc.addPosition(adminId, election.id, 'President', 1, 1);
    const position = (await svc.store.listPositions(election.id))[0];
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.addCandidate(adminId, election.id, position.id, 'Ben Kollie');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    const csv = [
      'memberId,fullName,email,phone',
      'S001,Alice Doe,alice@example.org,',
      'S002,Bob Doe,bob@example.org,',
    ].join('\n');
    await expect(svc.importRegister(registrarId, election.id, csv)).resolves.toMatchObject({ eligible: 2, duplicates: 0 });
    const frozen = await svc.freezeRegister(registrarId, election.id);
    expect(frozen.state).toBe('REGISTER_FROZEN');
    expect(frozen.registerHash).toBeTruthy();
    expect((await svc.transition(adminId, election.id, 'READY')).state).toBe('READY');
  });

  it('rejects invalid transitions (EMP-LIFE-001)', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await expect(svc.transition(adminId, election.id, 'OPEN')).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it('blocks configuration changes after register freeze', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    await svc.importRegister(registrarId, election.id, 'memberId,fullName,email\nS001,Alice,alice@example.org');
    await svc.freezeRegister(registrarId, election.id);
    await expect(svc.addPosition(adminId, election.id, 'Vice President')).rejects.toThrow(/CONFIG_FROZEN/);
    await expect(svc.importRegister(registrarId, election.id, 'memberId,fullName,email\nS009,X,x@example.org')).rejects.toThrow(/REGISTER_FROZEN/);
  });

  it('flags duplicates and blocks freeze until resolved (FR-VOT-002/T3)', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    const csv = [
      'memberId,fullName,email',
      'S001,Alice,alice@example.org',
      'S001,Alice Clone,alice@example.org',
      'bad-row',
    ].join('\n');
    const result = await svc.importRegister(registrarId, election.id, csv);
    expect(result.eligible).toBe(1);
    expect(result.duplicates).toBe(1);
    await expect(svc.freezeRegister(registrarId, election.id)).rejects.toThrow(/duplicate/i);
    const dup = store.voters.find((v) => v.status === 'duplicate_unresolved')!;
    await svc.resolveDuplicate(registrarId, election.id, dup.id, 'ineligible');
    await svc.freezeRegister(registrarId, election.id);
    await expect(svc.registerStats(election.id)).resolves.toMatchObject({ eligible: 1, entitlements: 1 });
  });

  it('auto-generates unique member IDs when the CSV omits them', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    // No memberId column at all - every voter gets a generated VM- ID.
    const csv = [
      'fullName,email,phone',
      'Alice Auto,alice.auto@example.org,',
      'Bob Auto,,+23188000001',
    ].join('\n');
    const result = await svc.importRegister(registrarId, election.id, csv);
    expect(result).toMatchObject({ eligible: 2, duplicates: 0 });
    const voters = store.voters.filter((v) => v.electionId === election.id);
    expect(voters).toHaveLength(2);
    for (const v of voters) expect(v.memberId).toMatch(/^VM-[A-Z2-9]{8}$/);
    expect(new Set(voters.map((v) => v.memberId)).size).toBe(2);
    // A second batch generates IDs that do not collide with the first.
    await svc.importRegister(registrarId, election.id, 'fullName,email\nCarol Auto,carol.auto@example.org');
    const ids = store.voters.filter((v) => v.electionId === election.id).map((v) => v.memberId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates member IDs for blank memberId cells in a mixed CSV', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    const csv = [
      'memberId,fullName,email',
      'EMP-1042,Alice Known,alice.known@example.org',
      ',Bob Blank,bob.blank@example.org',
    ].join('\n');
    const result = await svc.importRegister(registrarId, election.id, csv);
    expect(result).toMatchObject({ eligible: 2, duplicates: 0 });
    const voters = store.voters.filter((v) => v.electionId === election.id);
    expect(voters.find((v) => v.fullName === 'Alice Known')!.memberId).toBe('EMP-1042');
    expect(voters.find((v) => v.fullName === 'Bob Blank')!.memberId).toMatch(/^VM-[A-Z2-9]{8}$/);
  });

  it('enforces SoD-8 and audits the denied attempt (SoD-9)', async () => {
    const election = await setupElection();
    const user = await svc.createUser(orgId, 'dual@example.org', 'Dual Role', 'pw-long-enough');
    await svc.assignRole(adminId, orgId, user.id, 'auditor', election.id);
    const auditBefore = store.audit.length;
    await expect(svc.assignRole(adminId, orgId, user.id, 'organization_owner', election.id)).rejects.toThrow(/SOD_VIOLATION/);
    expect(store.audit.length).toBe(auditBefore + 1);
    expect(store.audit[store.audit.length - 1].outcome).toContain('denied');
    await expect(svc.verifyAuditChain()).resolves.toBe(true);
  });

  it('signs staff in with a code emailed after the password check', async () => {
    await setupElection();
    const user = await svc.createUser(orgId, 'auditor@example.org', 'Auditor Person', 'pw-long-enough');
    await svc.assignRole(adminId, orgId, user.id, 'auditor', null);
    // The password alone never yields a session.
    const step = await svc.login('auditor@example.org', 'pw-long-enough');
    expect(step).toMatchObject({ codeSent: true, email: 'auditor@example.org' });
    expect(step).not.toHaveProperty('token');
    await expect(svc.verifyLogin('auditor@example.org', '000000' === step.devCode ? '111111' : '000000')).rejects.toThrow(/OTP_INVALID/);
    const session = await svc.verifyLogin('auditor@example.org', step.devCode!);
    expect(session.token).toBeTruthy();
    // A code works once.
    await expect(svc.verifyLogin('auditor@example.org', step.devCode!)).rejects.toThrow(/OTP_EXPIRED/);
    await expect(svc.login('auditor@example.org', 'wrong-password')).rejects.toThrow(/AUTH_FAILED/);
  });

  it('locks a staff code after too many wrong guesses and rejects an unknown email', async () => {
    await setupElection();
    const user = await svc.createUser(orgId, 'guess@example.org', 'Guesser', 'pw-long-enough');
    await svc.assignRole(adminId, orgId, user.id, 'auditor', null);
    const step = await svc.login('guess@example.org', 'pw-long-enough');
    const wrong = step.devCode === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await expect(svc.verifyLogin('guess@example.org', wrong)).rejects.toThrow(/OTP_INVALID/);
    await expect(svc.verifyLogin('guess@example.org', step.devCode!)).rejects.toThrow(/OTP_LOCKED/);
    await expect(svc.verifyLogin('nobody@example.org', '123456')).rejects.toThrow(/OTP_INVALID/);
  });

  it('refuses an account email that cannot receive a code', async () => {
    await expect(svc.createUser(orgId, 'not-an-email', 'Bad', 'pw-long-enough')).rejects.toThrow(/INVALID_INPUT/);
  });

  it('imports a 10,000-record register and reconciles entitlements', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    const lines = ['memberId,fullName,email'];
    for (let i = 1; i <= 10000; i++) {
      lines.push(`M${String(i).padStart(5, '0')},Member ${i},member${i}@example.org`);
    }
    const start = Date.now();
    const result = await svc.importRegister(registrarId, election.id, lines.join('\n'));
    const elapsed = Date.now() - start;
    expect(result.eligible).toBe(10000);
    expect(result.duplicates).toBe(0);
    await svc.freezeRegister(registrarId, election.id);
    await expect(svc.registerStats(election.id)).resolves.toMatchObject({ eligible: 10000, entitlements: 10000 });
    // Generous bound: this guards against accidental quadratic blowups, not hardware.
    expect(elapsed).toBeLessThan(30000);
  }, 60000);

  it('requires dedicated workflows for close and results states', async () => {
    const election = await setupElection();
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    await svc.importRegister(registrarId, election.id, 'memberId,fullName,email\nS001,Alice,alice@example.org');
    await svc.freezeRegister(registrarId, election.id);
    await svc.transition(adminId, election.id, 'READY');
    await svc.transition(adminId, election.id, 'OPEN');

    await expect(svc.transition(adminId, election.id, 'CLOSED')).rejects.toThrow(/dedicated workflow/);
    await svc.closeElection(adminId, election.id);
    await expect(svc.transition(adminId, election.id, 'TALLIED')).rejects.toThrow(/dedicated workflow/);
  });

  it('enforces the configured voting window', async () => {
    const election = await svc.createElection(adminId, orgId, {
      name: 'Window Election',
      votingOpensAt: new Date(Date.now() + 86_400_000).toISOString(),
      votingClosesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    const position = await svc.addPosition(adminId, election.id, 'President', 1, 1);
    await svc.addCandidate(adminId, election.id, position.id, 'Ada Kamara');
    await svc.transition(adminId, election.id, 'CONFIGURED');
    await svc.transition(adminId, election.id, 'REGISTRATION');
    await svc.importRegister(registrarId, election.id, 'memberId,fullName,email\nS001,Alice,alice@example.org');
    await svc.freezeRegister(registrarId, election.id);
    await svc.transition(adminId, election.id, 'READY');
    await svc.transition(adminId, election.id, 'OPEN');

    await expect(svc.requestOtp(election.id, 'S001')).rejects.toThrow(/not opened/);
    await expect(svc.verifyOtp(election.id, 'S001', '123456')).rejects.toThrow(/not opened/);

    await store.updateElection(election.id, { votingOpensAt: new Date(Date.now() - 1000).toISOString() });
    await expect(svc.requestOtp(election.id, 'S001')).resolves.toMatchObject({ sent: true });
  });
});
