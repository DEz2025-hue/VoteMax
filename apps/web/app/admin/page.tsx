'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input,
  Select, Skeleton, Stat, Table, Textarea, Toast, errorToast, type ToastData,
} from '../../components/ui';
import { fraudHeaders } from '../../lib/fraud';
import { prepareCandidatePhoto } from '../../lib/image';
import { apiRequest } from '../../lib/http';
import { friendlyFromUnknown } from '../../lib/errors';
import { Icon } from '../../components/icons';
import { TotpQr, totpUri } from '../../components/totp-qr';
import { ConsoleShell, Kpi, Panel } from '../../components/saas';
import { clearSession, fetchPrincipal, isPlatformOnly, signOut as apiSignOut } from '../../lib/auth';
import { hasCapability, type AssignmentInfo } from '../../lib/capabilities';
import { downloadRegisterTemplate, previewRegisterCsv } from '../../lib/register-csv';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let sessionToken = '';

function authHeaders(): Record<string, string> {
  return sessionToken ? { authorization: `Bearer ${sessionToken}` } : {};
}

async function call(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  return apiRequest(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders(), ...(await fraudHeaders()) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
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

const LIFECYCLE_ORDER = [
  'DRAFT', 'CONFIGURED', 'REGISTRATION', 'REGISTER_FROZEN', 'READY', 'OPEN',
  'CLOSED', 'TALLIED', 'VERIFIED', 'CERTIFIED', 'PUBLISHED',
] as const;

type Section = 'overview' | 'organization' | 'users' | 'setup' | 'voters' | 'results' | 'audit' | 'fraud' | 'session';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'organization', label: 'Organization', icon: 'building' },
  { id: 'users', label: 'Users and roles', icon: 'users' },
  { id: 'setup', label: 'Election setup', icon: 'sliders' },
  { id: 'voters', label: 'Voter register', icon: 'clipboard' },
  { id: 'results', label: 'Results and reports', icon: 'chart' },
  { id: 'audit', label: 'Security and audit', icon: 'filetext' },
  { id: 'fraud', label: 'Fraud signals', icon: 'flag' },
  { id: 'session', label: 'Session', icon: 'user' },
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
interface VoterRow { id: string; memberId: string; fullName: string; email?: string; phone?: string; status: string; statusReason: string | null }
interface PositionRow { id: string; title: string; seats: number; maxChoices: number; candidates?: { id: string; fullName: string; statement: string | null; photoUrl?: string | null }[] }
interface ElectionDetail {
  id: string; name: string; state: string; organizationId: string;
  description: string | null; voteType: string; resultsMode: string; announcement: string | null;
  autoOpen: boolean; autoClose: boolean;
  votingOpensAt: string | null; votingClosesAt: string | null; timezone: string;
  positions: PositionRow[];
  register: { total: number; eligible: number; duplicatesUnresolved: number; entitlements: number };
}
interface ApprovalRow { userId: string; kind: 'tally' | 'certify'; role: string; displayName: string; email: string; createdAt: string }
interface Participation { eligible: number; ballotsCast: number; turnoutPercent: number }
interface Report {
  election: { id: string; name: string; state: string; announcement?: string | null };
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

// ---- Results flow: close -> count -> verify -> certify -> publish ----
const RESULT_STEPS = ['Voting closed', 'Counted', 'Verified', 'Certified', 'Published'] as const;

/** How many result steps are finished for an election state (0 = voting still running or not started). */
function resultsProgress(state: string): number {
  switch (state) {
    case 'CLOSED': return 1;
    case 'TALLIED': case 'RECOUNT': return 2;
    case 'VERIFIED': return 3;
    case 'CERTIFIED': return 4;
    case 'PUBLISHED': case 'ARCHIVED': return 5;
    default: return 0;
  }
}

const RESULT_NEXT: Record<number, { title: string; text: string }> = {
  0: { title: 'Voting has not closed yet', text: 'Results can be counted once voting is closed. Close voting when the window ends (or let it close automatically on schedule).' },
  1: { title: 'Next: count the votes', text: "Two auditors approve the count first. Then an organization owner runs it: running it is the owner's authorization." },
  2: { title: 'Next: an auditor verifies the count', text: 'Only an auditor can verify, so sign in with an auditor account and press Verify tally. It recounts every stored ballot independently and checks it matches. If the totals look wrong, use Recount instead.' },
  3: { title: 'Next: an owner certifies the results', text: 'Certification must be done by an owner other than the person who ran the tally, naming an auditor as second approver. This locks the official result.' },
  4: { title: 'Next: publish the results', text: 'An owner publishes. Choose to publish with an announcement, or also email the results to every voter on the register.' },
  5: { title: 'Results are published', text: 'The official result is final. Download a copy below for your records.' },
};

/** Who is elected for a position: top `seats` with votes, with ties at the cut-off flagged instead of guessed. */
function placeResults(p: { seats: number; results: { candidate: string; votes: number }[] }): ('elected' | 'tie' | null)[] {
  const cut = p.seats;
  const rows = p.results;
  const tieVotes = rows.length > cut && cut > 0 && rows[cut - 1].votes > 0 && rows[cut - 1].votes === rows[cut].votes ? rows[cut].votes : null;
  return rows.map((r, i) => {
    if (r.votes <= 0) return null;
    if (tieVotes !== null && r.votes === tieVotes) return 'tie';
    return i < cut ? 'elected' : null;
  });
}

function downloadResultsCsv(report: { election: { name: string }; positions: { position: string; seats: number; abstentions: number; results: { candidate: string; votes: number }[] }[]; ballotsCast: number }) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Position', 'Candidate', 'Votes', 'Percent of ballots', 'Result'].map(esc).join(',')];
  for (const p of report.positions) {
    const placed = placeResults(p);
    p.results.forEach((r, i) => {
      const pct = report.ballotsCast ? ((r.votes / report.ballotsCast) * 100).toFixed(1) : '0.0';
      lines.push([p.position, r.candidate, r.votes, pct, placed[i] === 'elected' ? 'Elected' : placed[i] === 'tie' ? 'Tie' : ''].map(esc).join(','));
    });
    if (p.abstentions) lines.push([p.position, 'Abstentions', p.abstentions, '', ''].map(esc).join(','));
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.election.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'results'}-results.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : '-';
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
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  // One-time TOTP secret for a just-created staff account; kept on screen until dismissed.
  const [newUserEnrollment, setNewUserEnrollment] = useState<{ email: string; totpSecret: string } | null>(null);
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [fraudEvents, setFraudEvents] = useState<FraudEventRow[] | null>(null);
  const [fraudBlocks, setFraudBlocks] = useState<FraudBlockRow[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvName, setCsvName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{ eligible: number; duplicates: number; errors: { line: number; message: string }[] } | null>(null);
  const [notifyBatches, setNotifyBatches] = useState<NotificationBatch[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editVoter, setEditVoter] = useState<VoterRow | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef('');

  const registerPreview = useMemo(() => (csvText.trim() ? previewRegisterCsv(csvText) : null), [csvText]);

  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) {
      setSessionChecked(true);
      return;
    }
    // Resolve the stored session before trusting it - expired or revoked
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
      } catch { /* corrupted wizard state - start fresh */ }
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

  // Load the numbers and report as soon as the Results page opens (and again
  // whenever the election moves to a new stage), instead of waiting for a click.
  useEffect(() => {
    if (signedIn && section === 'results' && electionId) void refreshResults().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, section, electionId, election?.state]);

  // Resumed wizard sessions may land on step 3 while the election is still
  // DRAFT/CONFIGURED - walk it forward to REGISTRATION so imports work.
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
      const f = friendlyFromUnknown(err);
      setStatus(f.message);
      // Expected situations (not ready yet, no permission) are guidance, not alarms.
      setStatusKind(f.severity === 'guidance' ? 'info' : 'error');
      setToast(errorToast(err, `${label} - ${f.title}`));
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
      autoOpen: f.get('autoOpen') === 'on',
      autoClose: f.get('autoClose') === 'on',
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

  /** Download the register with every voter's ID, so officers can hand IDs out directly. */
  function exportRegister() {
    const esc = (x: string) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const rows = [['memberId', 'fullName', 'email', 'phone', 'status'], ...voters.map((v) => [v.memberId, v.fullName, v.email ?? '', v.phone ?? '', v.status])];
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${orgSlug || 'voter'}-register.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
  }

  async function refreshResults() {
    if (!electionId) return;
    // Stage first: each result action (tally, verify, certify, publish) moves the election on.
    await refreshElection().catch(() => undefined);
    const [part, rep, appr] = await Promise.all([
      get(`/elections/${electionId}/participation`).catch(() => null),
      get(`/elections/${electionId}/report`).catch(() => null),
      get(`/elections/${electionId}/approvals`).catch(() => null),
    ]);
    setParticipation(part as Participation | null);
    setReport(rep as Report | null);
    setApprovals(Array.isArray(appr) ? (appr as unknown as ApprovalRow[]) : []);
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
    setSignedIn(false); setNewUserEnrollment(null); setUsers([]); setVoters([]); setElection(null); setParticipation(null); setReport(null); setAudit(null); setElections([]);
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
  // everything - the API still enforces per-request.
  const sectionAllowed = (caps: string[]) =>
    caps.length === 0 || !orgId || caps.some((c) => capOrg(c));

  const visibleSections = SECTIONS.filter((s) => sectionAllowed(SECTION_CAPS[s.id]));
  const activeSection: Section = visibleSections.some((s) => s.id === section) ? section : 'overview';
  const voterEditable = !!election && ['REGISTRATION', 'REGISTER_FROZEN', 'READY', 'OPEN', 'SUSPENDED'].includes(election.state);
  const configEditable = !!election && ['DRAFT', 'CONFIGURED', 'REGISTRATION'].includes(election.state);

  // Shared bulk-upload block - used by the setup wizard (step 3) and the
  // Voter register management section.
  const registerImportBox = (
    <div className="import-box">
      <div className="import-bar">
        <Button variant="secondary" size="sm" onClick={downloadRegisterTemplate}>Download template</Button>
        <span className="muted small">CSV · memberId optional - voters without one are given a unique ID automatically · email or phone required</span>
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
        <span className="muted small">or click to browse - you can also paste rows below</span>
      </div>
      <Field label="Or paste CSV" htmlFor="register-csv" hint="fullName is required. Blank memberId cells get a unique VM- ID, which is sent to the voter with their voting link. Voters need an email or phone to receive it.">
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
          title={!csvText.trim() ? 'Load a CSV file or paste rows below first' : cap('register.manage') ? undefined : 'Requires register.manage - assigned to organization_owner'}
          onClick={() => setConfirm({
            title: 'Import register',
            message: `Import ${registerPreview?.rowCount ?? '?'} rows into the voter register?`,
            action: () => void act('Import register', doRegisterImport),
          })}
        >Import register</Button>
      </div>
    </div>
  );

  // ---- Sign-offs: who has approved, what the executor's form pre-fills with ----
  // Two auditors approve; the owner who runs the count is the authorizer.
  const tallyRows = approvals.filter((a) => a.kind === 'tally' && a.userId !== userId);
  const preApprovers = tallyRows.map((a) => a.userId);
  const tallyReady = preApprovers.length >= 2;
  const prefillKey = preApprovers.join('|');
  const certApprovers = approvals.filter((a) => a.kind === 'certify');
  const certKey = certApprovers.map((a) => a.userId).join('|');

  function signOffs(kind: 'tally' | 'certify', title: string) {
    const rows = approvals.filter((a) => a.kind === kind);
    const mine = rows.find((a) => a.userId === userId);
    // Only auditors sign off, for the count and for certification; owners run the steps.
    const canSign = cap('tally.verify') && !cap('results.certify');
    const need = kind === 'tally' ? 2 : 1;
    const who = (a: ApprovalRow) => <li key={a.userId}>✓ <strong>{a.displayName}</strong> <span className="small muted">({fmtDate(a.createdAt)})</span></li>;
    return (
      <div className="signoff-box">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <ul className="signoffs">
          <li>
            <span className="muted">{kind === 'tally' ? 'Auditor approvals' : 'Auditor approval'} ({Math.min(rows.length, need)} of {need}):</span>{' '}
            {rows.length ? <ul>{rows.map(who)}</ul> : <span className="small">waiting</span>}
          </li>
        </ul>
        {canSign ? (
          mine ? (
            <div className="form-actions">
              <Badge tone="success">You approved this</Badge>
              <Button size="sm" variant="ghost" onClick={() => void act('Withdraw approval', async () => { await call(`/elections/${electionId}/approvals/${kind}`, {}, 'DELETE'); await refreshResults(); })}>Withdraw</Button>
            </div>
          ) : (
            <div className="form-actions">
              <Button variant="primary" onClick={() => void act('Approve', async () => { await call(`/elections/${electionId}/approvals`, { kind }); await refreshResults(); })}>
                {kind === 'certify' ? 'Approve certification' : 'Approve the count'}
              </Button>
            </div>
          )
        ) : <p className="small muted" style={{ margin: '8px 0 0' }}>{kind === 'tally' ? 'Two auditors approve here, then an owner runs the count.' : 'An auditor approves here, then an owner certifies.'}</p>}
      </div>
    );
  }

  const overlays = (
    <>
      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ''} message={confirm?.message ?? ''} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.action(); setConfirm(null); }} />
      {editVoter && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditVoter(null); }}>
          <form
            className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-voter-title"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const v = editVoter;
              void act('Update voter', async () => {
                await call(`/elections/${electionId}/register/voters/${v.id}`, {
                  fullName: String(f.get('fullName') ?? ''), email: String(f.get('email') ?? ''), phone: String(f.get('phone') ?? ''),
                }, 'PATCH');
                setEditVoter(null);
                await refreshVoters();
              });
            }}
          >
            <h2 id="edit-voter-title">Edit voter</h2>
            <p className="muted small">Member ID <code>{editVoter.memberId}</code> and eligibility don&apos;t change. Updating email or phone cancels any one-time code already sent.</p>
            <Field label="Full name" htmlFor="ev-name"><Input id="ev-name" name="fullName" defaultValue={editVoter.fullName} required /></Field>
            <Field label="Email" htmlFor="ev-email"><Input id="ev-email" name="email" type="email" defaultValue={editVoter.email ?? ''} /></Field>
            <Field label="Phone" hint="At least one of email or phone is required" htmlFor="ev-phone"><Input id="ev-phone" name="phone" defaultValue={editVoter.phone ?? ''} /></Field>
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setEditVoter(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={loading}>Save changes</Button>
            </div>
          </form>
        </div>
      )}
      {publishOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPublishOpen(false); }}>
          <form
            className="modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const emailResults = f.get('release') === 'email';
              const announcement = String(f.get('announcement') ?? '').trim();
              setPublishOpen(false);
              void act('Publish results', async () => {
                await call(`/elections/${electionId}/publish`, { emailResults, ...(announcement ? { announcement } : {}) }, 'POST');
                await refreshResults();
                if (emailResults) setToast({ message: 'Results published. Emailing them to voters now - progress shows under Voters.', kind: 'info' });
              });
            }}
          >
            <h2 id="publish-title">Publish results</h2>
            <p className="muted small">The certified report becomes final. Choose how voters hear about it. Publishing cannot be undone.</p>
            <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '8px 0' }}>
                <input type="radio" name="release" value="announce" defaultChecked style={{ marginTop: 4 }} />
                <span><strong>Publish and announce</strong><br /><span className="small muted">Results are published with your announcement. No emails are sent.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '8px 0' }}>
                <input type="radio" name="release" value="email" style={{ marginTop: 4 }} />
                <span><strong>Publish and email the results to voters</strong><br /><span className="small muted">Also sends the results summary to every voter on the register (email, or SMS if they have no email). Sent once.</span></span>
              </label>
            </fieldset>
            <Field label="Announcement (optional)" hint="Shown with the report, and included at the top of the email" htmlFor="pub-announcement">
              <Textarea id="pub-announcement" name="announcement" rows={3} defaultValue={election?.announcement ?? ''} placeholder="e.g. Results certified by the election committee on …" />
            </Field>
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={loading}>Publish</Button>
            </div>
          </form>
        </div>
      )}
      <Toast message={toast?.message ?? null} kind={toast?.kind} title={toast?.title} hint={toast?.hint} technical={toast?.technical} onClose={() => setToast(null)} />
    </>
  );

  return (
    <ConsoleShell
      subtitle="Election console"
      navLabel="Administration"
      nav={visibleSections.map((x) => ({ id: x.id, label: x.label, icon: x.icon }))}
      active={activeSection}
      onSelect={(id) => setSection(id as Section)}
      footer={
        <>
          <div className="ps-env">
            <i className={`ps-dot ${election ? 'ok' : 'off'}`} />
            <span>{election ? election.name : 'No election selected'}</span>
          </div>
          <button type="button" className="ps-signout" onClick={signOut}><Icon name="logout" /><span>Sign out</span></button>
        </>
      }
      title={visibleSections.find((x) => x.id === activeSection)?.label}
      description={election ? `${election.name} · ${election.state.replace('_', ' ').toLowerCase()}` : 'Manage your organization and elections.'}
      actions={
        <>
          {election && <Badge tone={electionPill(election.state)}>{election.state}</Badge>}
          <button type="button" className="ps-icon-btn" aria-label="Refresh all" title="Refresh all" onClick={() => void refreshAll()}><Icon name="refresh" /></button>
        </>
      }
      after={overlays}
    >
      <>
        {statusKind === 'error' && <Alert kind="error" title="Console status">{status}</Alert>}
        {(() => {
          // An election opens by itself (and sends its reminder) only once it is READY. Warn
          // when the opening time is near or past and it has not got that far.
          if (!election?.votingOpensAt || !['DRAFT', 'CONFIGURED', 'REGISTRATION', 'REGISTER_FROZEN'].includes(election.state)) return null;
          const mins = Math.round((new Date(election.votingOpensAt).getTime() - Date.now()) / 60_000);
          if (mins > 60) return null;
          const stage = election.state.replace('_', ' ').toLowerCase();
          const closed = election.votingClosesAt && new Date(election.votingClosesAt).getTime() <= Date.now();
          return mins <= 0 ? (
            <Alert kind="warning" title={`"${election.name}" should have opened by now`}>
              It is still in the <strong>{stage}</strong> stage, so it will not open on its own. Automatic start and the opening reminder only work once the election is marked <strong>Ready</strong>.
              Go to Election setup, Review &amp; launch: freeze the register, then click Mark ready.{closed ? ' Its closing time has also passed, so after marking it Ready, extend the closing time in the Schedule panel.' : ''}
            </Alert>
          ) : (
            <Alert kind="warning" title={`"${election.name}" opens in ${mins} minute${mins === 1 ? '' : 's'} but is not Ready yet`}>
              It is still in the <strong>{stage}</strong> stage. It will only open automatically, and send its reminder, if it is marked <strong>Ready</strong> before then
              (Election setup, Review &amp; launch: freeze the register, then Mark ready).
            </Alert>
          );
        })()}
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
                  <Field label="Slug - voter access code" htmlFor="org-slug-input"><Input id="org-slug-input" name="slug" required placeholder="example-org" /></Field>
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
              {(orgId || orgSlug) && <p className="small muted" style={{ marginTop: 14 }}>Organization ID: <code>{orgId || '-'}</code> · voter code: <code>{orgSlug || '-'}</code></p>}
            </Card>
          )}

          {activeSection === 'users' && (
            <Card title="Users and roles">
              <p className="muted small" style={{ marginTop: 0 }}>Create staff accounts, then assign roles. Privileged roles require the TOTP secret shown once at creation. SoD rules block conflicting combinations.</p>
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                void act('Create user', async () => {
                  const u = await call('/users', { organizationId: orgId, email: f.get('email'), displayName: f.get('name'), password: f.get('password') }) as { id: string; totpSecret?: string };
                  setNewUserEnrollment(u.totpSecret ? { email: String(f.get('email')), totpSecret: u.totpSecret } : null);
                  await refreshUsers();
                }); }}>
                <div className="form-grid">
                  <Field label="Email" htmlFor="user-email"><Input id="user-email" name="email" type="email" required /></Field>
                  <Field label="Display name" htmlFor="user-name"><Input id="user-name" name="name" required /></Field>
                  <Field label="Password (min 12 chars)" htmlFor="user-password"><Input id="user-password" name="password" type="password" required minLength={12} /></Field>
                </div>
                <Button type="submit" variant="primary" disabled={!orgId || !capOrg('roles.assign')}>Create user</Button>
              </form>
              {newUserEnrollment && (
                <div style={{ marginTop: 14 }}>
                  <Alert kind="success" title="Authenticator secret - share it once">
                    <p style={{ margin: '4px 0' }}><strong>{newUserEnrollment.email}</strong> must scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). It is not shown again:</p>
                    <div style={{ margin: '8px 0' }}><TotpQr email={newUserEnrollment.email} secret={newUserEnrollment.totpSecret} /></div>
                    <p className="small" style={{ margin: '4px 0' }}>Can't scan? Enter this setup key instead:</p>
                    <code style={{ wordBreak: 'break-all' }}>{newUserEnrollment.totpSecret}</code>
                    <p className="small" style={{ margin: '8px 0 0' }}>
                      Choose "Enter a setup key", account <code>{newUserEnrollment.email}</code>, type "Time based". On phones, <a href={totpUri(newUserEnrollment.email, newUserEnrollment.totpSecret)}>tap here to add it directly</a>.
                      Assign a role below, then they sign in at <a href="/login">/login</a> with email, password and the 6-digit code.
                    </p>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(newUserEnrollment.totpSecret).catch(() => undefined); }}>Copy secret</Button>
                      <Button type="button" variant="secondary" onClick={() => setNewUserEnrollment(null)}>Done</Button>
                    </div>
                  </Alert>
                </div>
              )}
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
                  <Table head={['Name', 'Email', 'MFA', 'Actions']}>
                    {users.map((u) => {
                      const self = u.id === userId;
                      return (
                        <tr key={u.id}>
                          <td>{u.displayName}{self && <span className="small muted"> (you)</span>}</td>
                          <td>{u.email}</td>
                          <td><Badge tone={u.mfaEnrolled ? 'success' : 'warning'}>{u.mfaEnrolled ? 'enrolled' : 'no'}</Badge></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <Button size="sm" variant="ghost" disabled={self || !capOrg('roles.assign')} title={self ? 'Ask another administrator to reset your authenticator' : undefined}
                                onClick={() => setConfirm({
                                  title: 'Reset authenticator',
                                  message: `Issue a new authenticator secret for ${u.email}? Their current one stops working and they are signed out. You will see the new secret once.`,
                                  action: () => void act('Reset authenticator', async () => {
                                    const r = await call(`/users/${u.id}/totp-reset`, {}) as { totpSecret?: string };
                                    setNewUserEnrollment(r.totpSecret ? { email: u.email, totpSecret: r.totpSecret } : null);
                                  }),
                                })}>Reset authenticator</Button>
                              <Button size="sm" variant="ghost" disabled={self || !capOrg('roles.assign')} title={self ? 'You cannot remove your own account' : undefined}
                                onClick={() => setConfirm({
                                  title: 'Remove user',
                                  message: `Permanently remove ${u.displayName} (${u.email})? They lose all access and cannot sign in again. Past audit records are kept. This cannot be undone.`,
                                  action: () => void act('Remove user', async () => {
                                    await call(`/users/${u.id}`, {}, 'DELETE');
                                    setNewUserEnrollment((cur) => (cur && cur.email === u.email ? null : cur));
                                    await refreshUsers();
                                  }),
                                })}>Remove</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                ) : <EmptyState title="No users loaded">Sign in and set an organization to list staff accounts.</EmptyState>}
              </div>
            </Card>
          )}

          {activeSection === 'setup' && (
            <Card title="Election setup">
              <p className="muted small" style={{ marginTop: 0 }}>Guided setup - details, ballot, voter register, then review and launch. Progress saves automatically; exit anytime and resume where you left off.</p>
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
                    {elections.map((el) => <option key={el.id} value={el.id}>{el.name} - {el.state}</option>)}
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
                    <Field label="Vote type" htmlFor="wiz-vote-type" hint="Online secret ballot - the only voting channel"><Select id="wiz-vote-type" name="voteType" defaultValue={election?.voteType ?? 'online'} disabled={!!election && election.state !== 'DRAFT'}><option value="online">Online - secret ballot</option></Select></Field>
                    <Field label="Voting opens" htmlFor="wiz-opens"><Input id="wiz-opens" name="opens" type="datetime-local" required defaultValue={toLocalInput(election?.votingOpensAt)} disabled={!!election && election.state !== 'DRAFT'} /></Field>
                    <Field label="Voting closes" htmlFor="wiz-closes"><Input id="wiz-closes" name="closes" type="datetime-local" required defaultValue={toLocalInput(election?.votingClosesAt)} disabled={!!election && election.state !== 'DRAFT'} /></Field>
                    <Field label="Results visibility" htmlFor="wiz-results-mode" hint="Applies to staff dashboards - the API enforces it"><Select id="wiz-results-mode" name="resultsMode" defaultValue={election?.resultsMode ?? 'live'} disabled={!!election && election.state !== 'DRAFT'}>
                      <option value="live">Live counts - turnout visible while voting is open</option>
                      <option value="final">Final results only - counts hidden until results are published</option>
                    </Select></Field>
                    <Field label="Results announcement (optional)" htmlFor="wiz-announcement" hint="Message shown with the published report"><Textarea id="wiz-announcement" name="announcement" rows={2} defaultValue={election?.announcement ?? ''} disabled={!!election && election.state !== 'DRAFT'} placeholder="e.g. Results certified by the election committee on …" /></Field>
                  </div>
                  <div className="schedule-switches">
                    <label className="check-row">
                      <input type="checkbox" name="autoOpen" defaultChecked={election?.autoOpen ?? true} disabled={!!election && election.state !== 'DRAFT'} />
                      <span><strong>Start voting automatically</strong><span className="muted small"> - a ready election opens by itself at the opening time.</span></span>
                    </label>
                    <label className="check-row">
                      <input type="checkbox" name="autoClose" defaultChecked={election?.autoClose ?? true} disabled={!!election && election.state !== 'DRAFT'} />
                      <span><strong>Close voting automatically</strong><span className="muted small"> - an open election closes by itself at the closing time.</span></span>
                    </label>
                  </div>
                  {election && election.state !== 'DRAFT' && <Alert kind="info" title="Details locked">This election is {election.state} - details can only change while it is a draft.</Alert>}
                  <div className="form-actions">
                    <Button type="submit" name="intent" value="continue" variant="primary" disabled={!orgId || !capOrg('election.configure')}>Save &amp; continue →</Button>
                    <Button type="submit" name="intent" value="exit" variant="secondary" disabled={!orgId || !capOrg('election.configure')}>Save &amp; exit</Button>
                  </div>
                </form>
              )}

              {wizardStep === 2 && (
                <>
                  <p className="muted small">Build the ballot: positions (what voters choose between) and candidates (the names on the ballot). Candidates are election records - they don&apos;t need accounts.</p>
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
                      const created = await call(`/elections/${electionId}/candidates`, { positionId, fullName: f.get('candidate'), statement: f.get('statement') || undefined }) as { id: string };
                      const file = f.get('photo');
                      if (file instanceof File && file.size > 0) {
                        try {
                          const image = await prepareCandidatePhoto(file);
                          await call(`/elections/${electionId}/candidates/${created.id}/photo`, { image }, 'PUT');
                        } catch (err) {
                          await refreshElection();
                          throw new Error(`Candidate added, but the photo wasn't saved. ${friendlyFromUnknown(err).message}`);
                        }
                      }
                      await refreshElection();
                    }); }}>
                    <div className="form-grid">
                      <Field label="Position" htmlFor="candidate-position"><Select id="candidate-position" name="positionId" required disabled={!positionOptions.length} onChange={(e) => setPositionId(e.target.value)} defaultValue={positionId}><option value="">Select…</option>{positionOptions}</Select></Field>
                      <Field label="Candidate name" htmlFor="candidate-name"><Input id="candidate-name" name="candidate" required placeholder="Full name" /></Field>
                      <Field label="Statement (optional)" htmlFor="candidate-statement"><Input id="candidate-statement" name="statement" /></Field>
                      <Field label="Photo (optional)" htmlFor="candidate-photo" hint="Helps voters recognise who they are voting for. It is cropped square and shrunk automatically."><Input id="candidate-photo" name="photo" type="file" accept="image/*" /></Field>
                    </div>
                    <Button type="submit" variant="primary" disabled={!electionId || !positionId || !cap('candidates.manage')}>Add candidate</Button>
                  </form>
                  <input
                    ref={photoInputRef} type="file" accept="image/*" hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      const target = photoTargetRef.current;
                      e.target.value = '';
                      if (!file || !target) return;
                      void act('Save photo', async () => {
                        const image = await prepareCandidatePhoto(file);
                        await call(`/elections/${electionId}/candidates/${target}/photo`, { image }, 'PUT');
                        await refreshElection();
                      });
                    }}
                  />
                  {election?.positions?.length ? (
                    <div style={{ marginTop: 16 }}>
                      <Table head={['Position', 'Seats', 'Candidates', '']}>
                        {election.positions.map((p) => (
                          <tr key={p.id}>
                            <td>{p.title}</td>
                            <td>{p.seats}</td>
                            <td>
                              {(p.candidates ?? []).length === 0 ? '-' : (p.candidates ?? []).map((c) => (
                                <span key={c.id} className="candidate-chip">
                                  <button
                                    type="button" className="cand-avatar-btn"
                                    disabled={!configEditable || !cap('candidates.manage')}
                                    title={configEditable ? (c.photoUrl ? 'Change photo' : 'Add photo') : undefined}
                                    aria-label={`${c.photoUrl ? 'Change' : 'Add'} photo for ${c.fullName}`}
                                    onClick={() => { photoTargetRef.current = c.id; photoInputRef.current?.click(); }}
                                  >
                                    {c.photoUrl
                                      ? <img className="cand-thumb" src={`${API}${c.photoUrl}`} alt="" />
                                      : <span className="cand-thumb cand-thumb-empty">{initialsOf(c.fullName)}</span>}
                                  </button>
                                  {c.fullName}
                                  {configEditable && c.photoUrl && (
                                    <button type="button" className="chip-link" title="Remove photo"
                                      onClick={() => void act('Remove photo', async () => { await call(`/elections/${electionId}/candidates/${c.id}/photo`, {}, 'DELETE'); await refreshElection(); })}>Remove photo</button>
                                  )}
                                  {configEditable && (
                                    <button type="button" className="chip-remove" title={`Remove ${c.fullName}`}
                                      onClick={() => setConfirm({ title: 'Remove candidate', message: `Remove ${c.fullName} from ${p.title}?`, action: () => void act('Remove candidate', async () => { await call(`/elections/${electionId}/candidates/${c.id}`, {}, 'DELETE'); await refreshElection(); }) })}>×</button>
                                  )}
                                </span>
                              ))}
                            </td>
                            <td>
                              {configEditable && (
                                <Button variant="ghost" size="sm"
                                  onClick={() => setConfirm({ title: 'Remove position', message: `Remove "${p.title}" and all its candidates?`, action: () => void act('Remove position', async () => { await call(`/elections/${electionId}/positions/${p.id}`, {}, 'DELETE'); await refreshElection(); }) })}>Remove</Button>
                              )}
                            </td>
                          </tr>
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
                    <Alert kind="info" title="Register sealed">This election is {election.state} - the voter register can no longer be changed.</Alert>
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
                  {(() => {
                    const preOpen = ['DRAFT', 'CONFIGURED', 'REGISTRATION', 'REGISTER_FROZEN', 'READY'].includes(election.state);
                    const running = ['OPEN', 'SUSPENDED'].includes(election.state);
                    const editable = (preOpen || running) && cap('election.openClose');
                    return (
                      <form
                        key={`${election.id}-${election.votingClosesAt}-${election.autoOpen}-${election.autoClose}`}
                        className="import-box" style={{ marginBottom: 16 }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const body: Record<string, unknown> = { autoClose: f.get('autoClose') === 'on' };
                          if (preOpen) body.autoOpen = f.get('autoOpen') === 'on';
                          const closes = String(f.get('closes') ?? '');
                          if (closes && closes !== toLocalInput(election.votingClosesAt)) body.votingClosesAt = new Date(closes).toISOString();
                          void act('Save schedule', async () => {
                            await call(`/elections/${electionId}/schedule`, body, 'PATCH');
                            await refreshElection();
                            await refreshElections();
                          });
                        }}
                      >
                        <h3 className="card-title" style={{ marginTop: 0 }}>Schedule</h3>
                        <p className="muted small" style={{ marginTop: 0 }}>
                          Opens {fmtDate(election.votingOpensAt)} · closes {fmtDate(election.votingClosesAt)}. A check runs every minute, so
                          the change happens within about a minute of the time. You can still open or close by hand with the buttons below.
                        </p>
                        <div className="schedule-switches">
                          <label className="check-row">
                            <input type="checkbox" name="autoOpen" defaultChecked={election.autoOpen} disabled={!editable || !preOpen} />
                            <span><strong>Start automatically</strong><span className="muted small"> at the opening time (once the election is ready).</span></span>
                          </label>
                          <label className="check-row">
                            <input type="checkbox" name="autoClose" defaultChecked={election.autoClose} disabled={!editable} />
                            <span><strong>Close automatically</strong><span className="muted small"> at the closing time. A paused election is never closed automatically.</span></span>
                          </label>
                        </div>
                        <Field label="Closing time" htmlFor="sched-closes" hint={election.state === 'DRAFT' || election.state === 'CONFIGURED' || election.state === 'REGISTRATION' || election.state === 'REGISTER_FROZEN' ? 'Set the closing time in the Details step before the election is ready.' : 'Once the election is ready, voting can be extended but not shortened.'}>
                          <Input id="sched-closes" name="closes" type="datetime-local" defaultValue={toLocalInput(election.votingClosesAt)} disabled={!editable || !['READY', 'OPEN', 'SUSPENDED'].includes(election.state)} />
                        </Field>
                        <div className="form-actions">
                          <Button type="submit" variant="secondary" size="sm" disabled={!editable || loading}>Save schedule</Button>
                        </div>
                      </form>
                    );
                  })()}

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
                      title={cap('register.freeze') ? 'Seal the imported register for voting (organization_owner)' : 'Requires register.freeze - assigned to organization_owner'}
                      onClick={() => setConfirm({ title: 'Freeze register', message: 'Freeze the voter register? This seals it for voting - imports and configuration changes stop.', action: () => void act('Freeze register', async () => { await call(`/elections/${electionId}/register/freeze`, {}); await refreshElection(); }) })}>Freeze register</Button>
                  </div>

                  <div className="import-box" style={{ marginBottom: 16 }}>
                    <h3 className="card-title" style={{ marginTop: 0 }}>Voter invitations</h3>
                    {voterLink() && (
                      <div className="result-row" style={{ marginBottom: 10 }}>
                        <div className="small muted" style={{ wordBreak: 'break-all' }}>{voterLink()}</div>
                        <Button variant="secondary" size="sm" onClick={() => void copyVoterLink()}>{copiedLink ? 'Copied!' : 'Copy link'}</Button>
                      </div>
                    )}
                    <p className="muted small">Voters sign in with their own personal link, which carries a secret key - this general link cannot sign anyone in. Send every eligible voter their member ID and personal link by email, or by text message when they have no email.</p>
                    <div className="form-actions">
                      <Button variant="primary" size="sm" disabled={!electionId || !cap('register.manage')}
                        title={cap('register.manage') ? 'Send every eligible voter their member ID and personal voting link' : 'Requires register.manage - assigned to organization_owner'}
                        onClick={() => setConfirm({
                          title: 'Send invitations',
                          message: `Send each eligible voter in ${election?.name} their member ID and voting link? They are sent by email, or by text message to voters without an email.`,
                          action: () => void act('Send invitations', doNotify),
                        })}>Send invitations to all eligible voters</Button>
                      <Button variant="ghost" size="sm" onClick={() => void refreshNotifications().catch(() => undefined)}>Refresh status</Button>
                    </div>
                    {notifyBatches.length > 0 && (
                      <Table head={['Type', 'Status', 'Sent', 'Failed', 'No contact', 'When']}>
                        {notifyBatches.slice(0, 6).map((b) => (
                          <tr key={b.id}>
                            <td className="small">{b.kind === 'invite' ? 'Invitation' : b.kind === 'reminder_open' ? 'Opens soon' : b.kind === 'results' ? 'Results' : 'Closes soon'}</td>
                            <td><Badge tone={b.status === 'completed' ? 'success' : b.status === 'failed' ? 'error' : 'warning'}>{b.status}</Badge></td>
                            <td>{b.sent}/{b.total}</td>
                            <td>{b.failed}</td>
                            <td>{b.skipped}</td>
                            <td className="small muted">{fmtDate(b.createdAt)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {notifyBatches.length === 0 && <p className="small muted">No invitations sent yet. Reminders are sent automatically 10 minutes before voting opens and closes, to voters who have not voted yet (the opening reminder needs the election to be Ready).</p>}
                  </div>

                  <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => goWizardStep(3)}>← Back</Button>
                    <Button type="button" variant="secondary" onClick={() => { sessionStorage.removeItem('votemax.wizard'); setSection('overview'); }}>Done - back to overview</Button>
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
                <Button variant="secondary" size="sm" disabled={voters.length === 0} title={voters.length === 0 ? 'Refresh voters first' : 'Download the register with each voter\'s member ID'} onClick={exportRegister}>Export with IDs (CSV)</Button>
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
                  title={cap('register.freeze') ? 'Seal the imported register for voting (organization_owner)' : 'Requires register.freeze - assigned to organization_owner'}
                  onClick={() => setConfirm({ title: 'Freeze register', message: 'Freeze the voter register? This seals it for voting - imports and configuration changes stop.', action: () => void act('Freeze register', async () => { await call(`/elections/${electionId}/register/freeze`, {}); await refreshElection(); }) })}>Freeze register</Button>
                <Button variant="danger" size="sm" disabled={!electionId || !cap('election.openClose')} onClick={() => setConfirm({ title: 'Close voting', message: 'Close voting for this election?', action: () => void act('Close voting', async () => { await call(`/elections/${electionId}/close`, {}); await refreshElection(); }) })}>Close voting</Button>
              </div>
              {registerImportBox}
              <div style={{ marginTop: 18 }}>
                {voters.length ? (
                  <Table head={['Member ID', 'Name', 'Status', 'Actions']}>
                    {voters.map((v) => (
                      <tr key={v.id}>
                        <td><code>{v.memberId}</code></td><td>{v.fullName}<div className="small muted">{[v.email, v.phone].filter(Boolean).join(' · ') || 'no contact'}</div></td>
                        <td><Badge tone={statusPill(v.status)}>{v.status}</Badge>{v.statusReason ? <span className="small muted"> - {v.statusReason}</span> : null}</td>
                        <td><span style={{ display: 'inline-flex', gap: 6 }}>
                          {voterEditable && cap('register.manage') && <Button size="sm" variant="ghost" onClick={() => setEditVoter(v)}>Edit</Button>}
                          {v.status === 'duplicate_unresolved' && (<>
                            <Button size="sm" disabled={!cap('register.manage')} onClick={() => void act('Resolve eligible', async () => { await call(`/elections/${electionId}/register/resolve`, { voterId: v.id, decision: 'eligible' }); await refreshVoters(); })}>Eligible</Button>
                            <Button size="sm" variant="secondary" disabled={!cap('register.manage')} onClick={() => void act('Resolve ineligible', async () => { await call(`/elections/${electionId}/register/resolve`, { voterId: v.id, decision: 'ineligible' }); await refreshVoters(); })}>Ineligible</Button>
                          </>)}
                        </span></td>
                      </tr>
                    ))}
                  </Table>
                ) : <EmptyState title="No voters loaded">Import a register CSV or refresh after setup.</EmptyState>}
              </div>
            </Card>
          )}

          {activeSection === 'results' && (
            <Card title="Results and reports">
              <Field label="Election" htmlFor="res-election" hint="Choose which election to work on">
                <Select id="res-election" value={electionId} onChange={(e) => { setElectionId(e.target.value); setReport(null); setParticipation(null); setApprovals([]); }}>
                  <option value="">Select an election…</option>
                  {elections.map((el) => <option key={el.id} value={el.id}>{el.name} - {el.state}</option>)}
                </Select>
              </Field>
              {!electionId && <Alert kind="info" title="Choose an election">Pick an election above to see its results and what is waiting for you.</Alert>}
              {election && (() => {
                const progress = resultsProgress(election.state);
                // The generic guidance assumes you do everything; tailor it to what this person can actually do.
                let next = RESULT_NEXT[progress];
                if (progress === 1 && !cap('tally.execute')) next = { title: 'Next: sign off on the count', text: cap('tally.verify') ? 'Approve the count below. Once two auditors have approved, an owner runs the count.' : 'Two auditors approve below, then an owner runs the count.' };
                if (progress === 2 && !cap('tally.verify')) next = { title: 'Waiting for an auditor to verify', text: 'Only an auditor can verify the count. It moves on as soon as they do.' };
                if (progress === 3 && !cap('results.certify')) next = { title: 'Next: approve certification', text: cap('tally.verify') ? 'Approve certification below. An owner then certifies the results.' : 'An auditor approves certification, then an owner certifies the results.' };
                if (progress === 4 && !cap('results.publish')) next = { title: 'Waiting for an owner to publish', text: 'The results are certified. An owner publishes them.' };
                return (
                  <div style={{ margin: '16px 0' }}>
                    <ol className="lifecycle" aria-label="Results progress">
                      {RESULT_STEPS.map((label, i) => <li key={label} className={i < progress ? 'done' : i === progress ? 'current' : ''}>{i < progress ? '✓ ' : `${i + 1}. `}{label}</li>)}
                    </ol>
                    <div style={{ marginTop: 12 }}>
                      <Alert kind={progress === 5 ? 'success' : 'info'} title={next.title}>
                        {next.text}
                        {progress === 0 && election.state === 'OPEN' && (
                          <div style={{ marginTop: 8 }}><Button variant="danger" size="sm" disabled={!cap('election.openClose')} onClick={() => setConfirm({ title: 'Close voting', message: 'Close voting for this election?', action: () => void act('Close voting', async () => { await call(`/elections/${electionId}/close`, {}); await refreshElection(); await refreshResults(); }) })}>Close voting now</Button></div>
                        )}
                      </Alert>
                    </div>
                  </div>
                );
              })()}
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <Stat label="Eligible voters" value={participation?.eligible ?? '-'} />
                <Stat label="Ballots cast" value={participation?.ballotsCast ?? '-'} />
                <Stat label="Turnout" value={participation ? `${participation.turnoutPercent}%` : '-'} />
                <Stat label="State" value={election ? <Badge tone={electionPill(election.state)}>{election.state}</Badge> : '-'} />
              </div>
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <Button variant="secondary" size="sm" disabled={!electionId} onClick={() => void act('Refresh results', refreshResults)}>Refresh</Button>
                <Button variant="ghost" size="sm" disabled={!electionId || !capAny(['participation.viewAggregate', 'results.publish', 'results.certify', 'audit.read'])} onClick={() => void act('View report', async () => { const r = await get(`/elections/${electionId}/report`); setReport(r as unknown as Report); })}>View report</Button>
              </div>

              {election && ['CLOSED', 'RECOUNT'].includes(election.state) && (
                <>
                  {signOffs('tally', 'Auditor approvals for the count')}
                  {cap('tally.execute') && (
                    <form key={`tally-${prefillKey}`} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                      void act('Run tally', async () => {
                        await call(`/elections/${electionId}/tally`, { approvers: [f.get('approver1'), f.get('approver2')] });
                        await refreshResults();
                      }); }}>
                      <h3 style={{ marginTop: 0 }}>Run the count</h3>
                      {tallyReady
                        ? <Alert kind="success" title="Both auditors have approved">You can run the count now. Running it as the organization owner is your authorization.</Alert>
                        : <Alert kind="info" title="Waiting for the auditors">{2 - preApprovers.length} more auditor{2 - preApprovers.length === 1 ? '' : 's'} must open Results and reports and press &quot;Approve the count&quot;. The form below fills in by itself.</Alert>}
                      <div className="form-grid" style={{ marginTop: 12 }}>
                        <Field label="Auditor 1" htmlFor="tally-a1"><Select id="tally-a1" name="approver1" required defaultValue={preApprovers[0] ?? ''}><option value="">Select…</option>{userOptions}</Select></Field>
                        <Field label="Auditor 2" htmlFor="tally-a2"><Select id="tally-a2" name="approver2" required defaultValue={preApprovers[1] ?? ''}><option value="">Select…</option>{userOptions}</Select></Field>
                      </div>
                      <div className="form-actions">
                        <Button type="submit" variant="primary" disabled={!electionId || !tallyReady}>Run tally</Button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {election && election.state === 'TALLIED' && cap('tally.verify') && (
                <div className="signoff-box">
                  <h3 style={{ marginTop: 0 }}>Verify the count</h3>
                  <p className="muted small" style={{ marginTop: 0 }}>Recounts every stored ballot independently and checks it matches the tally. Only an auditor can do this.</p>
                  <Button variant="primary" onClick={() => void act('Verify tally', async () => { await call(`/elections/${electionId}/tally/verify`, {}, 'POST'); await refreshResults(); })}>Verify tally</Button>
                </div>
              )}

              {election && election.state === 'VERIFIED' && (
                <>
                  {signOffs('certify', 'Sign-off for certification')}
                  {cap('results.certify') && (
                    <form key={`cert-${certKey}`} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                      void act('Certify results', async () => {
                        await call(`/elections/${electionId}/certify`, { certifiedBy: userId, secondApprover: f.get('secondApprover') });
                        await refreshResults();
                      }); }}>
                      <h3 style={{ marginTop: 0 }}>Certify the results</h3>
                      <div className="form-grid">
                        <Field label="Certified by" htmlFor="certify-by"><Input id="certify-by" value={users.find((u) => u.id === userId)?.displayName ?? userId} readOnly /></Field>
                        <Field label="Second approver (auditor)" htmlFor="certify-second"><Select id="certify-second" name="secondApprover" required defaultValue={certApprovers[0]?.userId ?? ''}><option value="">Select…</option>{userOptions}</Select></Field>
                      </div>
                      <div className="form-actions">
                        <Button type="submit" variant="primary" disabled={!userId || certApprovers.length === 0}>Certify results</Button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {election && election.state === 'CERTIFIED' && cap('results.publish') && (
                <div className="signoff-box">
                  <h3 style={{ marginTop: 0 }}>Publish the results</h3>
                  <Button variant="primary" onClick={() => setPublishOpen(true)}>Publish results</Button>
                </div>
              )}

              {election && ['TALLIED', 'VERIFIED'].includes(election.state) && cap('tally.execute') && (
                <details style={{ margin: '14px 0' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Recount (only if the result is disputed)</summary>
                  <div style={{ marginTop: 12 }}>
                    {signOffs('tally', 'Auditor approvals for a recount')}
                    <form key={`recount-${prefillKey}`} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
                      void act('Recount', async () => {
                        await call(`/elections/${electionId}/tally/recount`, { approvers: [f.get('approver1'), f.get('approver2')] });
                        await refreshResults();
                      }); }}>
                      <div className="form-grid">
                        <Field label="Auditor 1" htmlFor="recount-a1"><Select id="recount-a1" name="approver1" required defaultValue={preApprovers[0] ?? ''}><option value="">Select…</option>{userOptions}</Select></Field>
                        <Field label="Auditor 2" htmlFor="recount-a2"><Select id="recount-a2" name="approver2" required defaultValue={preApprovers[1] ?? ''}><option value="">Select…</option>{userOptions}</Select></Field>
                      </div>
                      <Button type="submit" variant="secondary" disabled={!tallyReady}>Recount</Button>
                    </form>
                  </div>
                </details>
              )}

              {report && (
                <div style={{ marginTop: 18 }}>
                  {(() => {
                    const counted = !!report.tallyHash;
                    const published = report.election.state === 'PUBLISHED' || report.election.state === 'ARCHIVED';
                    const cert = report.certification as { createdAt?: string } | null;
                    return (
                      <>
                        <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                          <h3 style={{ margin: 0 }}>{published ? 'Official results' : counted ? 'Results (not yet published)' : 'Results'}</h3>
                          {counted && <Button variant="secondary" size="sm" onClick={() => downloadResultsCsv(report)}>Download CSV</Button>}
                        </div>
                        <div className="result-block">
                          <div className="result-row"><div><strong>{report.election.name}</strong><div className="small muted">{published ? 'Published' : counted ? (cert ? 'Certified, awaiting publication' : 'Counted, not yet certified') : 'Votes not counted yet'}</div></div><Badge tone={electionPill(report.election.state)}>{report.election.state}</Badge></div>
                          {report.election.announcement && <div className="result-row" style={{ display: 'block' }}><span className="small muted">Announcement</span><div>{report.election.announcement}</div></div>}
                          <div className="result-row"><span>Eligible voters</span><strong>{report.eligibleVoters}</strong></div>
                          <div className="result-row"><span>Ballots cast</span><strong>{report.ballotsCast}</strong></div>
                          <div className="result-row"><span>Turnout</span><strong>{report.turnoutPercent}%</strong></div>
                          {!counted && (
                            <div className="result-row" style={{ display: 'block' }}>
                              <Alert kind="info" title="No vote counts yet">Candidate totals appear here once the tally has been run. Until then every candidate would show 0, which is not a result.</Alert>
                            </div>
                          )}
                          {counted && report.positions.map((p, i) => {
                            const placed = placeResults(p);
                            const total = report.ballotsCast;
                            return (
                              <div key={i} className="result-row" style={{ display: 'block' }}>
                                <strong>{p.position}</strong> <span className="small muted">({p.seats} seat{p.seats === 1 ? '' : 's'}{p.abstentions ? `, ${p.abstentions} abstained` : ''})</span>
                                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                                  {p.results.map((r, j) => {
                                    const pct = total ? (r.votes / total) * 100 : 0;
                                    return (
                                      <div key={j} className="cand-result">
                                        <div className="cand-result-head">
                                          <span>{r.candidate}</span>
                                          <span>{placed[j] === 'elected' && <Badge tone="success">Elected</Badge>}{placed[j] === 'tie' && <Badge tone="warning">Tie</Badge>} <strong>{r.votes}</strong> <span className="small muted">({pct.toFixed(1)}%)</span></span>
                                        </div>
                                        <div className="cand-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, pct)}%` }} className={placed[j] === 'elected' ? 'win' : ''} /></div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {placed.includes('tie') && <p className="small muted" style={{ margin: '8px 0 0' }}>Candidates are tied for the last seat. The tally does not break ties; follow your organization&apos;s rules.</p>}
                              </div>
                            );
                          })}
                          {counted && cert?.createdAt && <div className="result-row"><span>Certified</span><span>{fmtDate(String(cert.createdAt))}</span></div>}
                          <div className="result-row"><span>Tally hash</span><code>{report.tallyHash ?? '-'}</code></div>
                          <div className="result-row"><span>Evidence root</span>{report.evidenceRoot ? <code>{report.evidenceRoot}</code> : <span className="muted small">available after tally</span>}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
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
                        <tr key={r.hash}><td>{fmtDate(r.createdAt)}</td><td><code>{r.actorId ?? '-'}</code></td><td>{r.action}</td><td><code>{r.scope}</code></td><td><Badge tone={r.outcome.startsWith('success') ? 'success' : r.outcome.startsWith('denied') || r.outcome.includes('fail') ? 'error' : 'warning'}>{r.outcome}</Badge></td></tr>
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
                Abuse-detection events and active blocks (SEC-VOT-10). Only salted hashes and rule names are stored - never raw IPs, device fingerprints, or voter identifiers.
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
                      <td className="small muted">{b.liftedAt ? fmtDate(b.liftedAt) : '-'}</td>
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
              <h3>Recent events{electionId ? '' : ' - select an election'}</h3>
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
                      <td className="small">{ev.reasons.join(', ') || '-'}</td>
                      <td className="small muted"><code>{ev.signalHash ? `${ev.signalHash.slice(0, 10)}…` : '-'}</code></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {activeSection === 'overview' && (
            <>
              <div className="ps-kpis">
                <Kpi icon="building" label="Organization" value={orgId ? 'Connected' : 'Not set'} note={orgSlug ? `voter code: ${orgSlug}` : undefined} />
                <Kpi icon="calendar" label="Election" value={election ? election.name : 'None'} note={election ? election.state : 'select or create'} tone="navy" />
                <Kpi icon="users" label="Eligible voters" value={election?.register.eligible ?? '-'} note={election ? `${election.register.total} on register` : undefined} />
                <Kpi icon="ballot" label="Ballots cast" value={participation?.ballotsCast ?? '-'} note={participation ? `${participation.turnoutPercent}% turnout` : undefined} tone="green" />
              </div>
              <div className="ps-split">
                <Panel
                  title="Current election"
                  subtitle={election ? `${fmtDate(election.votingOpensAt)} → ${fmtDate(election.votingClosesAt)}` : undefined}
                  actions={election ? <Badge tone={electionPill(election.state)}>{election.state}</Badge> : undefined}
                >
                  {election ? (
                    <>
                      <ol className="lifecycle" aria-label="Election lifecycle">
                        {LIFECYCLE_ORDER.map((st, i) => {
                          const idx = LIFECYCLE_ORDER.indexOf(election.state as (typeof LIFECYCLE_ORDER)[number]);
                          const cls = idx < 0 ? '' : i < idx ? 'done' : i === idx ? 'current' : '';
                          return <li key={st} className={cls}><span>{st.replace('_', ' ').toLowerCase()}</span></li>;
                        })}
                      </ol>
                      <div className="stat-grid" style={{ margin: '18px 0 0' }}>
                        <Stat label="Total" value={election.register.total} />
                        <Stat label="Eligible" value={election.register.eligible} />
                        <Stat label="Duplicates" value={election.register.duplicatesUnresolved} />
                        <Stat label="Entitlements" value={election.register.entitlements} />
                      </div>
                      <div className="form-actions"><Button variant="secondary" size="sm" onClick={() => setSection('voters')}>Manage register</Button><Button variant="secondary" size="sm" onClick={() => setSection('results')}>Results</Button></div>
                    </>
                  ) : <EmptyState title="No election selected">Create an election in Election setup, or pick one there.</EmptyState>}
                </Panel>
                <Panel title="Quick actions">
                  <ul className="ps-list">
                    {([
                      ['setup', 'sliders', 'Election setup', 'Guided wizard for a new vote'],
                      ['users', 'users', 'Users and roles', 'Staff accounts and assignments'],
                      ['voters', 'clipboard', 'Voter register', 'Import, resolve duplicates, invite'],
                      ['audit', 'filetext', 'Audit log', 'Verify the hash chain'],
                    ] as const).filter(([id]) => visibleSections.some((x) => x.id === id)).map(([id, icon, label, hint]) => (
                      <li key={id}>
                        <span className="ps-avatar"><Icon name={icon} size={16} /></span>
                        <div className="ps-list-main"><strong>{label}</strong><span>{hint}</span></div>
                        <button type="button" className="ps-icon-btn" aria-label={label} onClick={() => setSection(id)}><Icon name="chevron" /></button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          )}
      </>
    </ConsoleShell>
  );
}
