'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input,
  Select, Skeleton, Stat, Table, Textarea, Toast,
} from '../../components/ui';
import { fraudHeaders } from '../../lib/fraud';
import { clearSession, fetchPrincipal, isPlatformOnly, signOut as apiSignOut } from '../../lib/auth';
import { hasCapability, type AssignmentInfo } from '../../lib/capabilities';
import { downloadRegisterTemplate, previewRegisterCsv } from '../../lib/register-csv';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let sessionToken = '';

function authHeaders(): Record<string, string> {
  return sessionToken ? { authorization: `Bearer ${sessionToken}` } : {};
}

async function call(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders(), ...(await fraudHeaders()) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : `Request failed (${res.status})`);
  return data;
}

const get = (path: string) => call(path, undefined, 'GET');

const ROLES = [
  'organization_owner', 'auditor',
] as const;

const LIFECYCLE_STEPS = [
  ['CONFIGURED', 'Mark configured'],
  ['REGISTRATION', 'Open registration'],
  ['READY', 'Mark ready'],
  ['OPEN', 'Open voting'],
] as const;

// Mirrors TRANSITION_CAPABILITIES in apps/api/src/auth/session.guard.ts.
const TRANSITION_CAPS: Record<string, string> = {
  CONFIGURED: 'election.configure',
  REGISTRATION: 'election.configure',
  READY: 'election.readiness.approve',
  OPEN: 'election.openClose',
};

// Capabilities the API treats as platform-scoped: a platform_admin principal
// passes the guard for these regardless of tenant assignment scope.
const PLATFORM_UI_CAPS = new Set([
  'organization.create', 'platform.tenants.read', 'platform.tenants.provision', 'platform.health.read',
]);

type Section = 'overview' | 'organization' | 'users' | 'setup' | 'voters' | 'results' | 'audit' | 'fraud' | 'session';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'organization', label: 'Organization' },
  { id: 'users', label: 'Users and roles' },
  { id: 'setup', label: 'Election setup' },
  { id: 'voters', label: 'Voter register' },
  { id: 'results', label: 'Results and reports' },
  { id: 'audit', label: 'Security and audit' },
  { id: 'fraud', label: 'Fraud signals' },
  { id: 'session', label: 'Session' },
];

// Minimum capabilities for a section to be worth showing. Empty = always.
// Checked at organization scope (most permissive), matching the API guards.
const SECTION_CAPS: Record<Section, string[]> = {
  overview: [],
  organization: ['roles.assign', 'organization.create'],
  users: ['roles.assign'],
  setup: ['election.configure'],
  voters: ['register.manage', 'register.freeze', 'participation.viewAggregate'],
  results: ['participation.viewAggregate', 'tally.execute', 'tally.verify', 'results.certify', 'results.publish', 'audit.read'],
  audit: ['audit.read', 'fraud.read'],
  fraud: ['fraud.read'],
  session: [],
};

interface AdminUser { id: string; email: string; displayName: string; mfaEnrolled: boolean }
interface VoterRow { id: string; memberId: string; fullName: string; status: string; statusReason: string | null }
interface PositionRow { id: string; title: string; seats: number; maxChoices: number; candidates?: { id: string; fullName: string; statement: string | null }[] }
interface ElectionDetail {
  id: string; name: string; state: string; organizationId: string;
  description: string | null; voteType: string; resultsMode: string; announcement: string | null;
  votingOpensAt: string | null; votingClosesAt: string | null; timezone: string;
  positions: PositionRow[];
  register: { total: number; eligible: number; duplicatesUnresolved: number; entitlements: number };
}
interface Participation { eligible: number; ballotsCast: number; turnoutPercent: number }
interface Report {
  election: { id: string; name: string; state: string };
  eligibleVoters: number; ballotsCast: number; turnoutPercent: number;
  positions: { position: string; seats: number; abstentions: number; results: { candidate: string; votes: number }[] }[];
  tallyHash: string | null; evidenceRoot: string | null;
  certification: Record<string, unknown> | null;
}
interface AuditRecord { organizationId: string | null; actorId: string | null; action: string; scope: string; outcome: string; createdAt: string; hash: string }
interface ElectionSummary { id: string; name: string; state: string; votingOpensAt: string | null; votingClosesAt: string | null }
interface AuditResponse { verified: boolean; records: AuditRecord[] }
interface NotificationBatch { id: string; kind: string; status: string; total: number; sent: number; failed: number; skipped: number; createdAt: string; completedAt: string | null }
interface FraudEventRow { electionId: string | null; rule: string; score: number; action: string; reasons: string[]; signalKind: string | null; signalHash: string | null; refHash: string | null; createdAt: string }
interface FraudBlockRow { id: string; kind: string; signalHash: string; electionId: string | null; rule: string; reason: string; score: number; expiresAt: string; createdAt: string; liftedAt: string | null; liftedBy: string | null }

function statusPill(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'eligible') return 'success';
  if (status === 'duplicate_unresolved' || status === 'pending') return 'warning';
  if (status === 'ineligible' || status === 'suspended') return 'error';
  return 'neutral';
}

function electionPill(state: string): 'success' | 'warning' | 'error' | 'accent' | 'navy' | 'neutral' {
  if (state === 'OPEN') return 'success';
  if (state === 'CLOSED' || state === 'TALLIED' || state === 'VERIFIED' || state === 'CERTIFIED' || state === 'PUBLISHED') return 'navy';
  if (state === 'SUSPENDED' || state === 'RECOUNT') return 'warning';
  if (state === 'CANCELLED' || state === 'ARCHIVED') return 'neutral';
  return 'accent';
}

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : '—';
}

function toLocalInput(v: string | null | undefined) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [electionId, setElectionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [wizardStep, setWizardStep] = useState(1);
  const [status, setStatus] = useState('Ready.');
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [fraudEvents, setFraudEvents] = useState<FraudEventRow[] | null>(null);
  const [fraudBlocks, setFraudBlocks] = useState<FraudBlockRow[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvName, setCsvName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{ eligible: number; duplicates: number; errors: { line: number; message: string }[] } | null>(null);
  const [notifyBatches, setNotifyBatches] = useState<NotificationBatch[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const registerPreview = useMemo(() => (csvText.trim() ? previewRegisterCsv(csvText) : null), [csvText]);

  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) {
      setSessionChecked(true);
      return;
    }
    // Resolve the stored session before trusting it — expired or revoked
    // tokens go to sign-in, and platform-only accounts belong to /platform.
    void fetchPrincipal(t).then((principal) => {
      if (!principal) {
        clearSession();
        setStatus('Your session has expired. Please sign in again.');
        setSessionChecked(true);
        return;
      }
      if (isPlatformOnly(principal)) {
        router.replace('/platform');
        return;
      }
      sessionToken = t;
      setSignedIn(true);
      setUserId(principal.userId);
      if (principal.organizationId) setOrgId(principal.organizationId);
      setAssignments(principal.assignments);
      sessionStorage.setItem('votemax.user', principal.userId);
      if (principal.organizationId) sessionStorage.setItem('votemax.org', principal.organizationId);
      sessionStorage.setItem('votemax.assignments', JSON.stringify(principal.assignments));
      const s = sessionStorage.getItem('votemax.orgSlug');
      if (s) setOrgSlug(s);
      const e = sessionStorage.getItem('votemax.election');
      if (e) setElectionId(e);
      try {
        const w = JSON.parse(sessionStorage.getItem('votemax.wizard') ?? 'null') as { electionId?: string; step?: number } | null;
        if (w?.electionId) {
          setElectionId(w.electionId);
          sessionStorage.setItem('votemax.election', w.electionId);
          if (w.step && w.step >= 1 && w.step <= 4) setWizardStep(w.step);
        }
      } catch { /* corrupted wizard state — start fresh */ }
      setSessionChecked(true);
    });
  }, [router]);

  // Signed-out visitors go to the dedicated sign-in page.
  useEffect(() => {
    if (sessionChecked && !signedIn) router.replace('/login');
  }, [sessionChecked, signedIn, router]);

  useEffect(() => {
    if (signedIn && orgId) { void refreshUsers().catch(() => undefined); void refreshElections().catch(() => undefined); }
    if (signedIn && electionId) { void refreshElection().catch(() => undefined); void refreshNotifications().catch(() => undefined); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, orgId, electionId]);

  useEffect(() => {
    if (signedIn && section === 'fraud') void refreshFraud().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, section, electionId]);

  // Resumed wizard sessions may land on step 3 while the election is still
  // DRAFT/CONFIGURED — walk it forward to REGISTRATION so imports work.
  useEffect(() => {
    if (wizardStep === 3 && electionId && election && ['DRAFT', 'CONFIGURED'].includes(election.state)) {
      void act('Open voter registration', async () => { await advanceToRegistration(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, election?.state]);

  // Poll notification batches while any are still queued/running.
  useEffect(() => {
    if (!electionId || !notifyBatches.some((b) => b.status === 'queued' || b.status === 'running')) return;
    const t = setInterval(() => void refreshNotifications().catch(() => undefined), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionId, notifyBatches]);

  async function act(label: string, fn: () => Promise<void>) {
    setStatus(`${label}: working…`);
    setStatusKind('info');
    setLoading(true);
    try {
      await fn();
      setStatus(`${label}: done.`);
      setStatusKind('info');
      setToast({ message: `${label} completed.`, kind: 'info' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      setStatus(`${label}: ${message}`);
      setStatusKind('error');
      setToast({ message: `${label} failed: ${message}`, kind: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function refreshUsers() {
    if (!orgId) return;
    const list = await get('/users') as unknown as AdminUser[];
    setUsers(Array.isArray(list) ? list : []);
  }

  async function refreshVoters() {
    if (!electionId) return;
    const list = await get(`/elections/${electionId}/register/voters`) as unknown as VoterRow[];
    setVoters(Array.isArray(list) ? list : []);
  }

  function loadCsvFile(file: File) {
    void file.text().then((text) => {
      setCsvText(text);
      setCsvName(file.name);
      setImportResult(null);
    });
  }

  function onCsvDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadCsvFile(file);
  }

  function persistWizard(step: number, elId = electionId) {
    if (elId) sessionStorage.setItem('votemax.wizard', JSON.stringify({ electionId: elId, step }));
    else sessionStorage.removeItem('votemax.wizard');
  }

  function goWizardStep(step: number) {
    setWizardStep(step);
    persistWizard(step);
  }

  async function saveElectionDetails(f: FormData, next?: number) {
    const payload = {
      name: String(f.get('name') ?? '').trim(),
      description: String(f.get('description') ?? '').trim() || undefined,
      votingOpensAt: String(f.get('opens') ?? ''),
      votingClosesAt: String(f.get('closes') ?? ''),
      voteType: String(f.get('voteType') ?? 'online'),
      resultsMode: String(f.get('resultsMode') ?? 'live'),
      announcement: String(f.get('announcement') ?? '').trim() || undefined,
    };
    if (!payload.name || !payload.votingOpensAt || !payload.votingClosesAt) {
      throw new Error('Election name and both voting times are required.');
    }
    let el: { id: string };
    if (electionId) {
      // The API only accepts detail edits while the election is DRAFT.
      el = await call(`/elections/${electionId}`, payload, 'PATCH') as unknown as { id: string };
    } else {
      el = await call('/elections', { organizationId: orgId, ...payload }) as unknown as { id: string };
      setElectionId(el.id);
      sessionStorage.setItem('votemax.election', el.id);
    }
    persistWizard(next ?? wizardStep, el.id);
    await refreshElection();
    await refreshElections();
    if (next) setWizardStep(next);
  }

  /** Walk the election forward to REGISTRATION so the register can be edited. */
  async function advanceToRegistration() {
    if (!electionId || !election) return;
    const next: Record<string, string> = { DRAFT: 'CONFIGURED', CONFIGURED: 'REGISTRATION' };
    let state = election.state;
    for (let i = 0; i < 2 && next[state]; i++) {
      await call(`/elections/${electionId}/transition`, { to: next[state] });
      state = next[state];
    }
    await refreshElection();
    await refreshElections();
  }

  function startNewElection() {
    setElectionId('');
    setElection(null);
    sessionStorage.removeItem('votemax.election');
    sessionStorage.removeItem('votemax.wizard');
    setWizardStep(1);
  }

  async function doRegisterImport(): Promise<void> {
    const result = await call(`/elections/${electionId}/register/import`, { csv: csvText }) as unknown as
      { eligible: number; duplicates: number; errors: { line: number; message: string }[] };
    setImportResult(result);
    await refreshVoters();
    await refreshElection();
  }

  function voterLink(): string | null {
    if (!orgSlug || !electionId) return null;
    return `${window.location.origin}/vote?org=${encodeURIComponent(orgSlug)}&election=${electionId}`;
  }

  async function refreshNotifications() {
    if (!electionId) { setNotifyBatches([]); return; }
    const list = await get(`/elections/${electionId}/notifications`) as unknown as NotificationBatch[];
    setNotifyBatches(Array.isArray(list) ? list : []);
  }

  async function doNotify() {
    await call(`/elections/${electionId}/notify`, {});
    await refreshNotifications();
  }

  async function copyVoterLink() {
    const link = voterLink();
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function refreshElections() {
    if (!orgId) { setElections([]); return; }
    const list = await get('/elections') as unknown as ElectionSummary[];
    setElections(Array.isArray(list) ? list : []);
  }

  async function refreshElection() {
    if (!electionId) { setElection(null); return; }
    const data = await get(`/elections/${electionId}`) as unknown as ElectionDetail;
    setElection(data);
    setDetail(JSON.stringify(data, null, 2));
  }

  async function refreshResults() {
    if (!electionId) return;
    const [part, rep] = await Promise.all([
      get(`/elections/${electionId}/participation`).catch(() => null),
      get(`/elections/${electionId}/report`).catch(() => null),
    ]);
    setParticipation(part as Participation | null);
    setReport(rep as Report | null);
  }

  async function refreshAudit() {
    const data = await get('/audit') as unknown as AuditResponse;
    setAudit(data);
  }

  async function refreshFraud() {
    const [blocks, events] = await Promise.all([
      get('/fraud/blocks').catch(() => null),
      electionId ? get(`/elections/${electionId}/fraud/events`).catch(() => null) : Promise.resolve(null),
    ]);
    setFraudBlocks(Array.isArray(blocks) ? (blocks as unknown as FraudBlockRow[]) : []);
    setFraudEvents(Array.isArray(events) ? (events as unknown as FraudEventRow[]) : []);
  }

  async function refreshAll() {
    await Promise.all([
      refreshElection().catch(() => undefined),
      refreshVoters().catch(() => undefined),
      refreshUsers().catch(() => undefined),
      refreshElections().catch(() => undefined),
      refreshResults().catch(() => undefined),
    ]);
  }

  function signOut() {
    // Revokes the bearer session server-side, then clears local state.
    void apiSignOut();
    sessionToken = '';
    setSignedIn(false); setUsers([]); setVoters([]); setElection(null); setParticipation(null); setReport(null); setAudit(null); setElections([]);
    setOrgId(''); setOrgSlug(''); setElectionId(''); setUserId(''); setAssignments([]);
  }

  // While the stored session is being validated, show a neutral loading
  // state; signed-out visitors are redirected to /login by the effect above.
  if (!sessionChecked) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Skeleton lines={5} />
        </div>
      </main>
    );
  }
  if (!signedIn) return null;

  const userOptions = users.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>);
  const positionOptions = (election?.positions ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>);

  // ---- capability-aware UI -------------------------------------------------
  // Mirrors the API guards closely enough to hide/disable what would be
  // rejected anyway. The server remains the enforcement point.
  const isPlatformAdmin = assignments.some((a) => a.role === 'platform_admin');
  const cap = (capability: string, scope: { election?: boolean } = {}) =>
    (isPlatformAdmin && PLATFORM_UI_CAPS.has(capability)) ||
    hasCapability(assignments, orgId, capability, {
      electionId: scope.election === false ? null : electionId || null,
    });
  const capOrg = (capability: string) => cap(capability, { election: false });
  const capAny = (capabilities: string[]) => capabilities.some((c) => cap(c));

  // When the org context is unknown (legacy session, org-less account) show
  // everything — the API still enforces per-request.
  const sectionAllowed = (caps: string[]) =>
    caps.length === 0 || !orgId || caps.some((c) => capOrg(c));

  const visibleSections = SECTIONS.filter((s) => sectionAllowed(SECTION_CAPS[s.id]));
  const activeSection: Section = visibleSections.some((s) => s.id === section) ? section : 'overview';

  // Shared bulk-upload block — used by the setup wizard (step 3) and the
  // Voter register management section.
  const registerImportBox = (
    <div className="import-box">
      <div className="import-bar">
        <Button variant="secondary" size="sm" onClick={downloadRegisterTemplate}>Download template</Button>
        <span className="muted small">CSV · memberId optional (auto-generated VM- IDs) · email or phone required for OTP delivery</span>
      </div>
      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => csvFileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') csvFileRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onCsvDrop}
      >
        <input
          ref={csvFileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadCsvFile(f); e.target.value = ''; }}
        />
        <strong>{csvName || 'Drop your voter CSV here'}</strong>
        <span className="muted small">or click to browse — you can also paste rows below</span>
      </div>
      <Field label="Or paste CSV" htmlFor="register-csv" hint="fullName is required. Blank memberId cells get an auto-generated VM- ID. Voters need an email or phone to receive their OTP code.">
        <Textarea
          id="register-csv"
          name="csv"
          rows={6}
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setImportResult(null); }}
          placeholder={'fullName,email,phone\nAlice Doe,alice@example.org,+231 88 000 0000\nBob Smith,,+231 88 000 0001'}
        />
      </Field>
      {registerPreview && (
        <div className="import-preview">
          <div className="import-preview-stats">
            <Badge tone="neutral">{registerPreview.rowCount.toLocaleString()} valid rows</Badge>
            <Badge tone={registerPreview.issueCount ? 'warning' : 'success'}>
              {registerPreview.issueCount ? `${registerPreview.issueCount} issue${registerPreview.issueCount === 1 ? '' : 's'}` : 'No issues detected'}
            </Badge>
            {!registerPreview.hasMemberId && <Badge tone="accent">memberId auto-generated</Badge>}
          </div>
          {registerPreview.sample.length > 0 && (
            <Table head={registerPreview.headers.slice(0, 6)}>
              {registerPreview.sample.map((r, i) => (
                <tr key={i}>{registerPreview.headers.slice(0, 6).map((_, j) => <td key={j} className="small">{r[j] ?? ''}</td>)}</tr>
              ))}
            </Table>
          )}
          {registerPreview.issues.length > 0 && (
            <ul className="import-issues">
              {registerPreview.issues.map((iss, i) => <li key={i} className="small muted">Line {iss.line}: {iss.message}</li>)}
              {registerPreview.issueCount > registerPreview.issues.length && (
                <li className="small muted">…and {registerPreview.issueCount - registerPreview.issues.length} more</li>
              )}
            </ul>
          )}
        </div>
      )}
      {importResult && (
        <Alert kind={importResult.errors.length || importResult.duplicates ? 'warning' : 'success'} title="Import result">
          {importResult.eligible.toLocaleString()} eligible · {importResult.duplicates} duplicates · {importResult.errors.length} row errors.
          {importResult.errors.length > 0 && (
            <ul className="import-issues">
              {importResult.errors.slice(0, 8).map((err, i) => <li key={i} className="small">Line {err.line}: {err.message}</li>)}
            </ul>
          )}
        </Alert>
      )}
      <div className="form-actions">
        <Button
          variant="primary"
          disabled={!electionId || !csvText.trim() || !cap('register.manage')}
          title={!csvText.trim() ? 'Load a CSV file or paste rows below first' : cap('register.manage') ? undefined : 'Requires register.manage — assigned to organization_owner'}
          onClick={() => setConfirm({
            title: 'Import register',
            message: `Import ${registerPreview?.rowCount ?? '?'} rows into the voter register?`,
            action: () => void act('Import register', doRegisterImport),
          })}
        >Import register</Button>
      </div>
    </div>
  );

  const nav = (
    <nav className="admin-nav" aria-label="Administration">
      {visibleSections.map((s) => (
        <button key={s.id} type="button" className={activeSection === s.id ? 'active' : ''} onClick={() => { setSection(s.id); setMobileNav(false); }}>
          {s.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="admin-shell">
      <>
        <aside className={`admin-sidebar ${mobileNav ? 'open' : ''}`}>
          <div className="admin-brand">VoteMax Administration</div>
          {nav}
        </aside>
        {mobileNav && <div className="drawer-backdrop" onClick={() => setMobileNav(false)} />}
      </>

      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <Button variant="secondary" size="sm" className="nav-toggle" onClick={() => setMobileNav((v) => !v)}>Sections</Button>
            <h1>{visibleSections.find((s) => s.id === activeSection)?.label}</h1>
            <div className="breadcrumbs">
              <a href="/">Home</a><span>/</span><span>Administration</span><span>/</span><span>{visibleSections.find((s) => s.id === activeSection)?.label}</span>
            </div>
          </div>
          <div className="card-actions">
            <Badge tone="success">Signed in</Badge>
            {election && <Badge tone={electionPill(election.state)}>{election.state}</Badge>}
          </div>
        </div>

        <Alert kind={statusKind === 'error' ? 'error' : 'info'} title="Console status">{status}</Alert>

        <div className="admin-content">
          {activeSection === 'session' && (
            <Card title="Session">
              <p>You are signed in as user <code>{userId || 'unknown'}</code>.</p>
              <p className="muted small">Organization: <code>{orgId || 'not set'}</code>{orgSlug ? ` · voter code: ${orgSlug}` : ''}</p>
              <Button variant="secondary" onClick={signOut}>Sign out</Button>
            </Card>
          )}

          {activeSection === 'organization' && (
            <Card title="Organization">
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Create organization', async () => {
                  const org = await call('/organizations', { name: f.get('name'), slug: f.get('slug') }) as { id: string; slug?: string };
                  setOrgId(org.id);
                  if (org.slug) setOrgSlug(org.slug);
                  sessionStorage.setItem('votemax.org', org.id);
                  if (org.slug) sessionStorage.setItem('votemax.orgSlug', org.slug);
                }); }}>
                <div className="form-grid">
                  <Field label="Organization name" htmlFor="org-name"><Input id="org-name" name="name" required placeholder="Example Organization" /></Field>
                  <Field label="Slug — voter access code" htmlFor="org-slug-input"><Input id="org-slug-input" name="slug" required placeholder="example-org" /></Field>
                </div>
                <Button type="submit" variant="primary" disabled={!capOrg('organization.create')} title={capOrg('organization.create') ? undefined : 'Requires the platform administrator role'}>Create organization</Button>
              </form>
              <hr className="divider" />
              <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                const id = String(f.get('existingOrg') ?? '').trim();
                const slug = String(f.get('existingSlug') ?? '').trim();
                if (id) { setOrgId(id); sessionStorage.setItem('votemax.org', id); }
                if (slug) { setOrgSlug(slug); sessionStorage.setItem('votemax.orgSlug', slug); }
                setStatus('Organization context updated.');
              }}>
                <div className="form-grid">
                  <Field label="Existing organization ID" htmlFor="existing-org"><Input id="existing-org" name="existingOrg" defaultValue={orgId} /></Field>
                  <Field label="Existing organization slug" htmlFor="existing-slug"><Input id="existing-slug" name="existingSlug" defaultValue={orgSlug} /></Field>
                </div>
                <Button type="submit" variant="secondary">Set organization context</Button>
              </form>
              {(orgId || orgSlug) && <p className="small muted" style={{ marginTop: 14 }}>Organization ID: <code>{orgId || '—'}</code> · voter code: <code>{orgSlug || '—'}</code></p>}
            </Card>
          )}

          {activeSection === 'users' && (
            <Card title="Users and roles">
              <p className="muted small" style={{ marginTop: 0 }}>Create staff accounts, then assign roles. Privileged roles require the TOTP secret shown once at creation. SoD rules block conflicting combinations.</p>
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Create user', async () => {
                  const u = await call('/users', { organizationId: orgId, email: f.get('email'), displayName: f.get('name'), password: f.get('password') }) as { id: string; totpSecret?: string };
                  setStatus(`Create user: done. TOTP secret for ${f.get('email')}: ${u.totpSecret ?? '(none)'} — shown once, store it now.`);
                  await refreshUsers();
                }); }}>
                <div className="form-grid">
                  <Field label="Email" htmlFor="user-email"><Input id="user-email" name="email" type="email" required /></Field>
                  <Field label="Display name" htmlFor="user-name"><Input id="user-name" name="name" required /></Field>
                  <Field label="Password (min 12 chars)" htmlFor="user-password"><Input id="user-password" name="password" type="password" required minLength={12} /></Field>
                </div>
                <Button type="submit" variant="primary" disabled={!orgId || !capOrg('roles.assign')}>Create user</Button>
              </form>
              <hr className="divider" />
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Assign role', async () => {
                  const scope = String(f.get('scope') ?? 'org');
                  await call('/roles', {
                    organizationId: orgId, userId: f.get('userId'), role: f.get('role'),
                    electionId: scope === 'org' ? null : electionId,
                  });
                  await refreshUsers();
                }); }}>
                <div className="form-grid">
                  <Field label="User" htmlFor="role-user"><Select id="role-user" name="userId" required disabled={users.length === 0}><option value="">Select…</option>{userOptions}</Select></Field>
                  <Field label="Role" htmlFor="role-name"><Select id="role-name" name="role" required>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
                  <Field label="Scope" htmlFor="role-scope"><Select id="role-scope" name="scope"><option value="org">Whole organization</option><option value="election" disabled={!electionId}>This election{electionId ? '' : ' (select one first)'}</option></Select></Field>
                </div>
                <Button type="submit" variant="primary" disabled={!orgId || !capOrg('roles.assign') || users.length === 0}>Assign role</Button>
              </form>
              <div style={{ marginTop: 18 }}>
                {users.length ? (
                  <Table head={['Name', 'Email', 'MFA']}>
                    {users.map((u) => <tr key={u.id}><td>{u.displayName}</td><td>{u.email}</td><td><Badge tone={u.mfaEnrolled ? 'success' : 'warning'}>{u.mfaEnrolled ? 'enrolled' : 'no'}</Badge></td></tr>)}
                  </Table>
                ) : <EmptyState title="No users loaded">Sign in and set an organization to list staff accounts.</EmptyState>}
              </div>
            </Card>
          )}

          {activeSection === 'setup' && (
            <Card title="Election setup">
              <p className="muted small" style={{ marginTop: 0 }}>Guided setup — details, ballot, voter register, then review and launch. Progress saves automatically; exit anytime and resume where you left off.</p>
              <div className="inline-form" style={{ marginBottom: 16 }}>
                <Field label="Election" htmlFor="wizard-election" hint="Pick an existing election or start a new one">
                  <Select id="wizard-election" value={electionId} onChange={(e) => {
                    const id = e.target.value;
                    setElectionId(id);
                    if (id) { sessionStorage.setItem('votemax.election', id); persistWizard(1, id); }
                    else { sessionStorage.removeItem('votemax.election'); sessionStorage.removeItem('votemax.wizard'); setWizardStep(1); }
                    void refreshElection();
                  }}>
                    <option value="">New election…</option>
                    {elections.map((el) => <option key={el.id} value={el.id}>{el.name} — {el.state}</option>)}
                  </Select>
                </Field>
                <Button type="button" variant="secondary" onClick={() => void act('Refresh elections', refreshElections)}>Refresh</Button>
                {electionId && <Button type="button" variant="ghost" onClick={startNewElection}>Start new</Button>}
              </div>

              <div className="wizard-steps">
                {([['Details', 1], ['Ballot', 2], ['Voter register', 3], ['Review & launch', 4]] as const).map(([label, step]) => (
                  <button key={step} type="button" className={`wizard-step ${wizardStep === step ? 'active' : ''} ${wizardStep > step ? 'done' : ''}`}
                    onClick={() => {
                      if (step === 3 && electionId && election && ['DRAFT', 'CONFIGURED'].includes(election.state)) {
                        void act('Open voter registration', async () => { await advanceToRegistration(); goWizardStep(3); });
                      } else goWizardStep(step);
                    }}>
                    <span className="wizard-step-num">{step}</span> {label}
                  </button>
                ))}
              </div>

              {wizardStep === 1 && (
                <form key={election ? election.id : 'new'} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                  const intent = String(f.get('intent') ?? 'continue');
                  void act('Save election details', async () => {
                    await saveElectionDetails(f, intent === 'exit' ? undefined : 2);
                    if (intent === 'exit') setSection('overview');
                  }); }}>
                  <p className="muted small">Name the vote, set the voting window, choose how results are released, and add an optional announcement shown with published results.</p>
                  <div className="form-grid">
                    <Field label="Vote title" htmlFor="wiz-name"><Input id="wiz-name" name="name" required defaultValue={election?.name ?? ''} placeholder="Board Election 2026" disabled={!!election && election.state !== 'DRAFT'} /></Field>
                    <Field label="Vote type" htmlFor="wiz-vote-type" hint="Online secret ballot — the only voting channel"><Select id="wiz-vote-type" name="voteType" defaultValue={election?.voteType ?? 'online'} disabled={!!election && election.state !== 'DRAFT'}><option value="online">Online — secret ballot</option></Select></Field>
                    <Field label="Voting opens" htmlFor="wiz-opens"><Input id="wiz-opens" name="opens" type="datetime-local" required defaultValue={toLocalInput(election?.votingOpensAt)} disabled={!!election && election.state !== 'DRAFT'} /></Field>
                    <Field label="Voting closes" htmlFor="wiz-closes"><Input id="wiz-closes" name="closes" type="datetime-local" required defaultValue={toLocalInput(election?.votingClosesAt)} disabled={!!election && election.state !== 'DRAFT'} /></Field>
                    <Field label="Results visibility" htmlFor="wiz-results-mode" hint="Applies to staff dashboards — the API enforces it"><Select id="wiz-results-mode" name="resultsMode" defaultValue={election?.resultsMode ?? 'live'} disabled={!!election && election.state !== 'DRAFT'}>
                      <option value="live">Live counts — turnout visible while voting is open</option>
                      <option value="final">Final results only — counts hidden until results are published</option>
                    </Select></Field>
                    <Field label="Results announcement (optional)" htmlFor="wiz-announcement" hint="Message shown with the published report"><Textarea id="wiz-announcement" name="announcement" rows={2} defaultValue={election?.announcement ?? ''} disabled={!!election && election.state !== 'DRAFT'} placeholder="e.g. Results certified by the election committee on …" /></Field>
                  </div>
                  {election && election.state !== 'DRAFT' && <Alert kind="info" title="Details locked">This election is {election.state} — details can only change while it is a draft.</Alert>}
                  <div className="form-actions">
                    <Button type="submit" name="intent" value="continue" variant="primary" disabled={!orgId || !capOrg('election.configure')}>Save &amp; continue →</Button>
                    <Button type="submit" name="intent" value="exit" variant="secondary" disabled={!orgId || !capOrg('election.configure')}>Save &amp; exit</Button>
                  </div>
                </form>
              )}

              {wizardStep === 2 && (
                <>
                  <p className="muted small">Build the ballot: positions (what voters choose between) and candidates (the names on the ballot). Candidates are election records — they don&apos;t need accounts.</p>
                  {!electionId && <Alert kind="info" title="Details first">Save the election details in step 1 before adding positions and candidates.</Alert>}
                  <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                    void act('Add position', async () => {
                      const p = await call(`/elections/${electionId}/positions`, { title: f.get('title'), seats: Number(f.get('seats') || 1), maxChoices: Number(f.get('maxChoices') || 1) }) as { id: string };
                      setPositionId(p.id);
                      await refreshElection();
                    }); }}>
                    <div className="form-grid">
                      <Field label="Position title" htmlFor="position-title"><Input id="position-title" name="title" required placeholder="President" /></Field>
                      <Field label="Seats" htmlFor="position-seats"><Input id="position-seats" name="seats" type="number" min={1} defaultValue={1} /></Field>
                      <Field label="Max choices per voter" htmlFor="position-max"><Input id="position-max" name="maxChoices" type="number" min={1} defaultValue={1} /></Field>
                    </div>
                    <Button type="submit" variant="primary" disabled={!electionId || !cap('election.configure')}>Add position</Button>
                  </form>
                  <hr className="divider" />
                  <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                    void act('Add candidate', async () => {
                      await call(`/elections/${electionId}/candidates`, { positionId, fullName: f.get('candidate'), statement: f.get('statement') || undefined });
                      await refreshElection();
                    }); }}>
                    <div className="form-grid">
                      <Field label="Position" htmlFor="candidate-position"><Select id="candidate-position" name="positionId" required disabled={!positionOptions.length} onChange={(e) => setPositionId(e.target.value)} defaultValue={positionId}><option value="">Select…</option>{positionOptions}</Select></Field>
                      <Field label="Candidate name" htmlFor="candidate-name"><Input id="candidate-name" name="candidate" required placeholder="Full name" /></Field>
                      <Field label="Statement (optional)" htmlFor="candidate-statement"><Input id="candidate-statement" name="statement" /></Field>
                    </div>
                    <Button type="submit" variant="primary" disabled={!electionId || !positionId || !cap('candidates.manage')}>Add candidate</Button>
                  </form>
                  {election?.positions?.length ? (
                    <div style={{ marginTop: 16 }}>
                      <Table head={['Position', 'Seats', 'Candidates']}>
                        {election.positions.map((p) => (
                          <tr key={p.id}><td>{p.title}</td><td>{p.seats}</td><td>{(p.candidates ?? []).map((c) => c.fullName).join(', ') || '—'}</td></tr>
                        ))}
                      </Table>
                    </div>
                  ) : null}
                  <div className="form-actions" style={{ marginTop: 16 }}>
                    <Button type="button" variant="ghost" onClick={() => goWizardStep(1)}>← Back</Button>
                    <Button type="button" variant="primary" disabled={!electionId} onClick={() => {
                      if (election && ['DRAFT', 'CONFIGURED'].includes(election.state)) {
                        void act('Open voter registration', async () => { await advanceToRegistration(); goWizardStep(3); });
                      } else goWizardStep(3);
                    }}>Save &amp; continue →</Button>
                  </div>
                </>
              )}

              {wizardStep === 3 && (
                <>
                  {!electionId && <Alert kind="info" title="Details first">Save the election details in step 1 before importing voters.</Alert>}
                  {election && !['DRAFT', 'CONFIGURED', 'REGISTRATION'].includes(election.state) && (
                    <Alert kind="info" title="Register sealed">This election is {election.state} — the voter register can no longer be changed.</Alert>
                  )}
                  {election?.register && (
                    <div className="stat-grid" style={{ marginBottom: 16 }}>
                      <Stat label="Total" value={election.register.total} />
                      <Stat label="Eligible" value={election.register.eligible} />
                      <Stat label="Duplicates" value={election.register.duplicatesUnresolved} />
                      <Stat label="Entitlements" value={election.register.entitlements} />
                    </div>
                  )}
                  {registerImportBox}
                  <div className="form-actions" style={{ marginTop: 16 }}>
                    <Button type="button" variant="ghost" onClick={() => goWizardStep(2)}>← Back</Button>
                    <Button type="button" variant="primary" disabled={!electionId} onClick={() => goWizardStep(4)}>Save &amp; continue →</Button>
                  </div>
                </>
              )}

              {wizardStep === 4 && election && (
                <>
                  <div className="result-row"><div><strong>{election.name}</strong><div className="small muted">{fmtDate(election.votingOpensAt)} → {fmtDate(election.votingClosesAt)} · {election.voteType === 'online' ? 'Online secret ballot' : election.voteType} · {election.resultsMode === 'final' ? 'Final results only' : 'Live counts'}</div></div><Badge tone={electionPill(election.state)}>{election.state}</Badge></div>
                  {election.announcement && <p className="small muted" style={{ marginTop: 8 }}>Announcement: {election.announcement}</p>}
                  <div className="stat-grid" style={{ margin: '16px 0' }}>
                    <Stat label="Positions" value={election.positions.length} />
                    <Stat label="Candidates" value={election.positions.reduce((n, p) => n + (p.candidates?.length ?? 0), 0)} />
                    <Stat label="Eligible voters" value={election.register.eligible} />
                    <Stat label="State" value={<Badge tone={electionPill(election.state)}>{election.state}</Badge>} />
                  </div>
                  <p className="muted small">Next lifecycle steps (each is audited and capability-checked):</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {LIFECYCLE_STEPS.map(([to, label]) => (
                      <Button key={to} variant="secondary" size="sm" disabled={!electionId || !cap(TRANSITION_CAPS[to])}
                        onClick={() => setConfirm({ title: label, message: `Move election to ${to}?`, action: () => void act(label, async () => { await call(`/elections/${electionId}/transition`, { to }); await refreshElection(); await refreshElections(); }) })}>
                        {label}
                      </Button>
                    ))}
                    <Button variant="danger" size="sm" disabled={!electionId || !cap('election.openClose')} onClick={() => setConfirm({ title: 'Close voting', message: 'Close voting for this election?', action: () => void act('Close voting', async () => { await call(`/elections/${electionId}/close`, {}); await refreshElection(); }) })}>Close voting</Button>
                    <Button variant="secondary" size="sm" disabled={!electionId || !cap('register.freeze')}
                      title={cap('register.freeze') ? 'Seal the imported register for voting (organization_owner)' : 'Requires register.freeze — assigned to organization_owner'}
                      onClick={() => setConfirm({ title: 'Freeze register', message: 'Freeze the voter register? This seals it for voting — imports and configuration changes stop.', action: () => void act('Freeze register', async () => { await call(`/elections/${electionId}/register/freeze`, {}); await refreshElection(); }) })}>Freeze register</Button>
                  </div>

                  <div className="import-box" style={{ marginBottom: 16 }}>
                    <h3 className="card-title" style={{ marginTop: 0 }}>Voter invitations</h3>
                    {voterLink() && (
                      <div className="result-row" style={{ marginBottom: 10 }}>
                        <div className="small muted" style={{ wordBreak: 'break-all' }}>{voterLink()}</div>
                        <Button variant="secondary" size="sm" onClick={() => void copyVoterLink()}>{copiedLink ? 'Copied!' : 'Copy link'}</Button>
                      </div>
                    )}
                    <p className="muted small">Share this link with voters — they&apos;ll enter their member ID and receive a one-time code. You can also email every eligible voter their member ID and this link directly.</p>
                    <div className="form-actions">
                      <Button variant="primary" size="sm" disabled={!electionId || !cap('register.manage')}
                        title={cap('register.manage') ? 'Email every eligible voter their voting link and member ID' : 'Requires register.manage — assigned to organization_owner'}
                        onClick={() => setConfirm({
                          title: 'Email voters',
                          message: `Send voting invitations by email to all eligible voters in ${election?.name}?`,
                          action: () => void act('Email voters', doNotify),
                        })}>Email all eligible voters</Button>
                      <Button variant="ghost" size="sm" onClick={() => void refreshNotifications().catch(() => undefined)}>Refresh status</Button>
                    </div>
                    {notifyBatches.length > 0 && (
                      <Table head={['Type', 'Status', 'Sent', 'Failed', 'Skipped', 'When']}>
                        {notifyBatches.slice(0, 6).map((b) => (
                          <tr key={b.id}>
                            <td className="small">{b.kind === 'invite' ? 'Invitation' : b.kind === 'reminder_open' ? 'Opens soon' : 'Closes soon'}</td>
                            <td><Badge tone={b.status === 'completed' ? 'success' : b.status === 'failed' ? 'error' : 'warning'}>{b.status}</Badge></td>
                            <td>{b.sent}/{b.total}</td>
                            <td>{b.failed}</td>
                            <td>{b.skipped}</td>
                            <td className="small muted">{fmtDate(b.createdAt)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {notifyBatches.length === 0 && <p className="small muted">No invitations sent yet. Reminders are sent automatically ~5 minutes before voting opens and closes.</p>}
                  </div>

                  <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => goWizardStep(3)}>← Back</Button>
                    <Button type="button" variant="secondary" onClick={() => { sessionStorage.removeItem('votemax.wizard'); setSection('overview'); }}>Done — back to overview</Button>
                  </div>
                </>
              )}
              {wizardStep === 4 && !election && <EmptyState title="No election selected">Go back to step 1 and save the election details first.</EmptyState>}
            </Card>
          )}

          {activeSection === 'voters' && (
            <Card title="Voter register">
              <div className="toolbar" style={{ marginBottom: 16 }}>
                <Button variant="secondary" size="sm" disabled={!electionId || !cap('register.manage')} onClick={() => void act('Refresh voters', refreshVoters)}>Refresh voters</Button>
                <Button variant="secondary" size="sm" disabled={!electionId || !capAny(['election.configure', 'register.manage', 'participation.viewAggregate', 'audit.read'])} onClick={() => void act('Refresh register stats', async () => { await refreshElection(); })}>Refresh stats</Button>
              </div>
              {election?.register && (
                <div className="stat-grid" style={{ marginBottom: 16 }}>
                  <Stat label="Total" value={election.register.total} />
                  <Stat label="Eligible" value={election.register.eligible} />
                  <Stat label="Duplicates" value={election.register.duplicatesUnresolved} />
                  <Stat label="Entitlements" value={election.register.entitlements} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {LIFECYCLE_STEPS.map(([to, label]) => (
                  <Button key={to} variant="secondary" size="sm" disabled={!electionId || !cap(TRANSITION_CAPS[to])}
                    onClick={() => setConfirm({ title: label, message: `Move election to ${to}?`, action: () => void act(label, async () => { await call(`/elections/${electionId}/transition`, { to }); await refreshElection(); }) })}>
                    {label}
                  </Button>
                ))}
                <Button variant="secondary" size="sm" disabled={!electionId || !cap('register.freeze')}
                  title={cap('register.freeze') ? 'Seal the imported register for voting (organization_owner)' : 'Requires register.freeze — assigned to organization_owner'}
                  onClick={() => setConfirm({ title: 'Freeze register', message: 'Freeze the voter register? This seals it for voting — imports and configuration changes stop.', action: () => void act('Freeze register', async () => { await call(`/elections/${electionId}/register/freeze`, {}); await refreshElection(); }) })}>Freeze register</Button>
                <Button variant="danger" size="sm" disabled={!electionId || !cap('election.openClose')} onClick={() => setConfirm({ title: 'Close voting', message: 'Close voting for this election?', action: () => void act('Close voting', async () => { await call(`/elections/${electionId}/close`, {}); await refreshElection(); }) })}>Close voting</Button>
              </div>
              {registerImportBox}
              <div style={{ marginTop: 18 }}>
                {voters.length ? (
                  <Table head={['Member ID', 'Name', 'Status', 'Resolve']}>
                    {voters.map((v) => (
                      <tr key={v.id}>
                        <td><code>{v.memberId}</code></td><td>{v.fullName}</td>
                        <td><Badge tone={statusPill(v.status)}>{v.status}</Badge>{v.statusReason ? <span className="small muted"> — {v.statusReason}</span> : null}</td>
                        <td>{v.status === 'duplicate_unresolved' && (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <Button size="sm" disabled={!cap('register.manage')} onClick={() => void act('Resolve eligible', async () => { await call(`/elections/${electionId}/register/resolve`, { voterId: v.id, decision: 'eligible' }); await refreshVoters(); })}>Eligible</Button>
                            <Button size="sm" variant="secondary" disabled={!cap('register.manage')} onClick={() => void act('Resolve ineligible', async () => { await call(`/elections/${electionId}/register/resolve`, { voterId: v.id, decision: 'ineligible' }); await refreshVoters(); })}>Ineligible</Button>
                          </span>
                        )}</td>
                      </tr>
                    ))}
                  </Table>
                ) : <EmptyState title="No voters loaded">Import a register CSV or refresh after setup.</EmptyState>}
              </div>
            </Card>
          )}

          {activeSection === 'results' && (
            <Card title="Results and reports">
              <p className="muted small" style={{ marginTop: 0 }}>Tally requires an owner authorization and two approvers (at least one auditor). Certification requires the session user and an auditor as second approver. All identifiers must be real organization members.</p>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <Stat label="Eligible voters" value={participation?.eligible ?? '—'} />
                <Stat label="Ballots cast" value={participation?.ballotsCast ?? '—'} />
                <Stat label="Turnout" value={participation ? `${participation.turnoutPercent}%` : '—'} />
                <Stat label="State" value={election ? <Badge tone={electionPill(election.state)}>{election.state}</Badge> : '—'} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Run tally', async () => {
                  const result = await call(`/elections/${electionId}/tally`, { authorizedBy: f.get('authorizedBy'), approvers: [f.get('approver1'), f.get('approver2')] });
                  setDetail(JSON.stringify(result, null, 2)); await refreshResults();
                }); }}>
                <div className="form-grid">
                  <Field label="Authorized by (owner)" htmlFor="tally-chair"><Select id="tally-chair" name="authorizedBy" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                  <Field label="Approver 1" htmlFor="tally-a1"><Select id="tally-a1" name="approver1" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                  <Field label="Approver 2" htmlFor="tally-a2"><Select id="tally-a2" name="approver2" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                </div>
                <div className="form-actions">
                  <Button type="submit" variant="primary" disabled={!electionId || users.length < 3 || !cap('tally.execute')}>Run tally</Button>
                  <Button variant="secondary" disabled={!electionId || !cap('tally.verify')} onClick={() => void act('Verify tally', async () => { const r = await call(`/elections/${electionId}/tally/verify`, {}, 'POST'); setDetail(JSON.stringify(r, null, 2)); await refreshResults(); })}>Verify tally</Button>
                  <Button variant="secondary" disabled={!electionId || !capAny(['participation.viewAggregate', 'results.publish', 'results.certify', 'audit.read'])} onClick={() => void act('Refresh results', refreshResults)}>Refresh</Button>
                </div>
              </form>
              <hr className="divider" />
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Recount', async () => {
                  const r = await call(`/elections/${electionId}/tally/recount`, { authorizedBy: f.get('authorizedBy'), approvers: [f.get('approver1'), f.get('approver2')] });
                  setDetail(JSON.stringify(r, null, 2)); await refreshResults();
                }); }}>
                <div className="form-grid">
                  <Field label="Recount authorized by (owner)" htmlFor="recount-chair"><Select id="recount-chair" name="authorizedBy" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                  <Field label="Approver 1" htmlFor="recount-a1"><Select id="recount-a1" name="approver1" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                  <Field label="Approver 2" htmlFor="recount-a2"><Select id="recount-a2" name="approver2" required disabled={users.length < 3}><option value="">Select…</option>{userOptions}</Select></Field>
                </div>
                <Button type="submit" variant="secondary" disabled={!electionId || users.length < 3 || !cap('tally.execute')}>Recount</Button>
              </form>
              <hr className="divider" />
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Certify results', async () => {
                  const r = await call(`/elections/${electionId}/certify`, { certifiedBy: userId, secondApprover: f.get('secondApprover') });
                  setDetail(JSON.stringify(r, null, 2)); await refreshResults();
                }); }}>
                <div className="form-grid">
                  <Field label="Certified by" htmlFor="certify-by"><Input id="certify-by" value={userId} readOnly /></Field>
                  <Field label="Second approver" htmlFor="certify-second"><Select id="certify-second" name="secondApprover" required disabled={users.length < 2}><option value="">Select…</option>{userOptions}</Select></Field>
                </div>
                <div className="form-actions">
                  <Button type="submit" variant="primary" disabled={!electionId || !userId || users.length < 2 || !cap('results.certify')}>Certify results</Button>
                  <Button variant="secondary" disabled={!electionId || !cap('results.publish')} onClick={() => setConfirm({ title: 'Publish results', message: 'Publish the certified report?', action: () => void act('Publish results', async () => { const r = await call(`/elections/${electionId}/publish`, {}, 'POST'); setDetail(JSON.stringify(r, null, 2)); await refreshResults(); }) })}>Publish results</Button>
                  <Button variant="ghost" disabled={!electionId || !capAny(['participation.viewAggregate', 'results.publish', 'results.certify', 'audit.read'])} onClick={() => void act('View report', async () => { const r = await get(`/elections/${electionId}/report`); setReport(r as unknown as Report); setDetail(JSON.stringify(r, null, 2)); })}>View report</Button>
                </div>
              </form>
              {report && (
                <div style={{ marginTop: 18 }}>
                  <h3>Published report</h3>
                  <div className="result-block">
                    <div className="result-row"><div><strong>{report.election.name}</strong><div className="small muted">{report.election.state}</div></div><Badge tone={electionPill(report.election.state)}>{report.election.state}</Badge></div>
                    <div className="result-row"><span>Eligible voters</span><strong>{report.eligibleVoters}</strong></div>
                    <div className="result-row"><span>Ballots cast</span><strong>{report.ballotsCast}</strong></div>
                    <div className="result-row"><span>Turnout</span><strong>{report.turnoutPercent}%</strong></div>
                    {report.positions.map((p, i) => (
                      <div key={i} className="result-row" style={{ display: 'block' }}>
                        <strong>{p.position}</strong> <span className="small muted">({p.seats} seat{p.seats === 1 ? '' : 's'}, {p.abstentions} abstain)</span>
                        <div style={{ marginTop: 8 }}>{p.results.map((r, j) => <div key={j} className="small">{r.candidate}: {r.votes}</div>)}</div>
                      </div>
                    ))}
                    <div className="result-row"><span>Tally hash</span><code>{report.tallyHash ?? '—'}</code></div>
                    <div className="result-row"><span>Evidence root</span><code>{report.evidenceRoot ?? '—'}</code></div>
                  </div>
                </div>
              )}
              {detail && <pre className="detail" style={{ marginTop: 16 }}>{detail}</pre>}
            </Card>
          )}

          {activeSection === 'audit' && (
            <Card title="Security and audit">
              <div className="toolbar" style={{ marginBottom: 16 }}>
                <Button variant="secondary" size="sm" disabled={!capOrg('audit.read')} onClick={() => void act('Refresh audit', refreshAudit)}>Refresh audit</Button>
              </div>
              {audit ? (
                <>
                  <Alert kind={audit.verified ? 'success' : 'error'} title={audit.verified ? 'Audit chain verified' : 'Audit chain verification failed'}>
                    {audit.verified ? 'The audit hash chain is intact.' : 'The audit hash chain could not be verified.'}
                  </Alert>
                  {audit.records.length ? (
                    <Table head={['Time', 'Actor', 'Action', 'Target', 'Outcome']}>
                      {audit.records.slice(0, 200).map((r) => (
                        <tr key={r.hash}><td>{fmtDate(r.createdAt)}</td><td><code>{r.actorId ?? '—'}</code></td><td>{r.action}</td><td><code>{r.scope}</code></td><td><Badge tone={r.outcome.startsWith('success') ? 'success' : r.outcome.startsWith('denied') || r.outcome.includes('fail') ? 'error' : 'warning'}>{r.outcome}</Badge></td></tr>
                      ))}
                    </Table>
                  ) : <EmptyState title="No audit records">Audit events appear here after administrative actions.</EmptyState>}
                </>
              ) : <Skeleton lines={6} />}
            </Card>
          )}

          {activeSection === 'fraud' && (
            <Card title="Fraud signals" actions={<Button variant="secondary" size="sm" onClick={() => void act('Refresh fraud', refreshFraud)}>Refresh</Button>}>
              <p className="muted small" style={{ marginTop: 0 }}>
                Abuse-detection events and active blocks (SEC-VOT-10). Only salted hashes and rule names are stored — never raw IPs, device fingerprints, or voter identifiers.
              </p>
              <h3>Active blocks</h3>
              {fraudBlocks === null ? <Skeleton lines={2} /> : fraudBlocks.length === 0 ? (
                <EmptyState title="No active blocks">No fraud blocks are currently in force.</EmptyState>
              ) : (
                <Table head={['Kind', 'Rule', 'Scope', 'Reason', 'Score', 'Expires', 'Lifted', '']}>
                  {fraudBlocks.map((b) => (
                    <tr key={b.id}>
                      <td><code>{b.kind}</code></td>
                      <td>{b.rule}</td>
                      <td className="small muted">{b.electionId ? `election ${b.electionId.slice(0, 8)}` : 'global'}</td>
                      <td className="small">{b.reason}</td>
                      <td>{b.score}</td>
                      <td className="small muted">{fmtDate(b.expiresAt)}</td>
                      <td className="small muted">{b.liftedAt ? fmtDate(b.liftedAt) : '—'}</td>
                      <td>{!b.liftedAt && capOrg('fraud.manage') && (
                        <Button size="sm" variant="secondary" onClick={() => setConfirm({
                          title: 'Lift fraud block',
                          message: `Lift the ${b.rule} block on signal ${b.signalHash.slice(0, 12)}…? The signal will be allowed again subject to normal rate limits.`,
                          action: () => void act('Lift fraud block', async () => { await call(`/fraud/blocks/${b.id}/lift`, {}); await refreshFraud(); }),
                        })}>Lift</Button>
                      )}</td>
                    </tr>
                  ))}
                </Table>
              )}
              <h3>Recent events{electionId ? '' : ' — select an election'}</h3>
              {!electionId ? (
                <p className="muted small">Select an election in the Elections section to view its fraud events.</p>
              ) : fraudEvents === null ? <Skeleton lines={3} /> : fraudEvents.length === 0 ? (
                <EmptyState title="No fraud events">No anti-fraud signals recorded for this election.</EmptyState>
              ) : (
                <Table head={['Time', 'Rule', 'Score', 'Action', 'Reasons', 'Signal']}>
                  {fraudEvents.slice(0, 100).map((ev, i) => (
                    <tr key={i}>
                      <td className="small muted">{fmtDate(ev.createdAt)}</td>
                      <td>{ev.rule}</td>
                      <td>{ev.score}</td>
                      <td><Badge tone={ev.action === 'block' ? 'error' : ev.action === 'throttle' ? 'warning' : 'success'}>{ev.action}</Badge></td>
                      <td className="small">{ev.reasons.join(', ') || '—'}</td>
                      <td className="small muted"><code>{ev.signalHash ? `${ev.signalHash.slice(0, 10)}…` : '—'}</code></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {activeSection === 'overview' && (
            <>
              <div className="stat-grid">
                <Stat label="Organization" value={orgId ? 'Set' : 'Not set'} note={orgSlug ? `voter code: ${orgSlug}` : undefined} />
                <Stat label="Election" value={election ? election.name : 'None'} note={election ? election.state : 'select or create'} />
                <Stat label="Eligible voters" value={election?.register.eligible ?? '—'} />
                <Stat label="Ballots cast" value={participation?.ballotsCast ?? '—'} />
              </div>
              <div className="admin-grid">
                <Card title="Current election">
                  {election ? (
                    <>
                      <div className="result-row"><div><strong>{election.name}</strong><div className="small muted">{fmtDate(election.votingOpensAt)} → {fmtDate(election.votingClosesAt)}</div></div><Badge tone={electionPill(election.state)}>{election.state}</Badge></div>
                      <div className="stat-grid" style={{ marginTop: 14 }}>
                        <Stat label="Total" value={election.register.total} />
                        <Stat label="Eligible" value={election.register.eligible} />
                        <Stat label="Duplicates" value={election.register.duplicatesUnresolved} />
                        <Stat label="Entitlements" value={election.register.entitlements} />
                      </div>
                      <div className="form-actions"><Button variant="secondary" size="sm" onClick={() => { setSection('voters'); }}>Manage register</Button><Button variant="secondary" size="sm" onClick={() => { setSection('results'); }}>Results</Button></div>
                    </>
                  ) : <EmptyState title="No election selected">Create an election or load one by ID.</EmptyState>}
                </Card>
                <Card title="Quick actions" className="context-card">
                  <div className="inline-form">
                    <Button variant="secondary" block onClick={() => void refreshAll()}>Refresh all</Button>
                    <Button variant="secondary" block onClick={() => setSection('organization')}>Organization</Button>
                    <Button variant="secondary" block onClick={() => setSection('users')}>Users and roles</Button>
                    <Button variant="secondary" block onClick={() => setSection('setup')}>Election setup</Button>
                    <Button variant="secondary" block onClick={() => setSection('audit')}>Audit log</Button>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </main>

      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ''} message={confirm?.message ?? ''} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.action(); setConfirm(null); }} />
      <Toast message={toast?.message ?? null} kind={toast?.kind} onClose={() => setToast(null)} />
    </div>
  );
}
