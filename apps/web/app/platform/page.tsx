'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Badge, Button, ConfirmDialog, EmptyState, Field, Input,
  Select, Skeleton, Table, Toast, errorToast, type ToastData,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { TotpQr } from '../../components/totp-qr';
import { AuthLayout, ConsoleShell, Kpi, Panel, StatusRow } from '../../components/saas';
import { fraudHeaders } from '../../lib/fraud';
import { apiRequest } from '../../lib/http';
import { friendlyFromUnknown } from '../../lib/errors';
import { API, sessionIsValid, signIn as apiSignIn, signOut as apiSignOut, storeSession } from '../../lib/auth';

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

type Section = 'overview' | 'organizations' | 'health';
type DetailTab = 'overview' | 'users' | 'elections' | 'roles' | 'provision';

const SECTIONS: { id: Section; label: string; icon: string; title: string; blurb: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid', title: 'Overview', blurb: 'Tenants, elections and system status at a glance.' },
  { id: 'organizations', label: 'Organizations', icon: 'building', title: 'Organizations', blurb: 'Create tenants, staff them and manage access.' },
  { id: 'health', label: 'Platform health', icon: 'pulse', title: 'Platform health', blurb: 'Storage, delivery providers and abuse signals.' },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'elections', label: 'Elections' },
  { id: 'roles', label: 'Roles' },
  { id: 'provision', label: 'Provision staff' },
];

interface TenantRow {
  id: string; name: string; slug: string; createdAt: string;
  userCount: number; electionCount: number;
  electionsByState: Record<string, number>;
  staffed: boolean;
}
interface TenantDetail extends Omit<TenantRow, 'staffed' | 'electionsByState' | 'userCount' | 'electionCount'> {
  users: { id: string; email: string; displayName: string; mfaEnrolled: boolean }[];
  elections: { id: string; name: string; state: string; votingOpensAt: string | null; votingClosesAt: string | null }[];
  roleAssignments: { userId?: string; role: string; electionId: string | null }[];
}
interface PlatformHealth {
  store: string; dbLatencyMs: number; pendingAuditEntries: number;
  uptimeSeconds: number; checkedAt: string;
  otpProviders: { email: boolean; emailVia?: string | null; smsAfricaTalking: boolean; smsWebhook: boolean; devAllowed: boolean };
  delivery?: {
    invitations: { at: string; channel: string; message: string } | null;
    codes: { at: string; channel: string; message: string } | null;
  };
  securitySignals: {
    loginFailureBuckets: number; lockedAccounts: number;
    otpRequestBuckets: number; otpVerifyFailureBuckets: number; scope: string;
  };
}

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : '-';
}

function fmtDay(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
}

function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function electionPill(state: string): 'success' | 'warning' | 'error' | 'accent' | 'navy' | 'neutral' {
  if (state === 'OPEN') return 'success';
  if (['CLOSED', 'TALLIED', 'VERIFIED', 'CERTIFIED', 'PUBLISHED'].includes(state)) return 'navy';
  if (['SUSPENDED', 'RECOUNT'].includes(state)) return 'warning';
  if (['CANCELLED', 'ARCHIVED'].includes(state)) return 'neutral';
  return 'accent';
}

function slugify(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function PlatformPage() {
  const [section, setSection] = useState<Section>('overview');
  const [signedIn, setSignedIn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: ReactNode; action: () => void } | null>(null);

  // Sign-in
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');

  // Directory browsing
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<'all' | 'staffed' | 'unstaffed'>('all');
  const [tenantPage, setTenantPage] = useState(0);

  // Directory + detail
  const [directory, setDirectory] = useState<TenantRow[] | null>(null);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  // New organization
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgAdminEmail, setOrgAdminEmail] = useState('');
  const [orgAdminName, setOrgAdminName] = useState('');
  const [orgAdminPassword, setOrgAdminPassword] = useState('');
  const [orgAdminRole, setOrgAdminRole] = useState('organization_owner');
  const [orgEnrollment, setOrgEnrollment] = useState<{ email: string; role: string; totpSecret: string } | null>(null);

  // Provisioning
  const [provEmail, setProvEmail] = useState('');
  const [provName, setProvName] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provRole, setProvRole] = useState('organization_owner');
  const [provElection, setProvElection] = useState('');
  const [enrolled, setEnrolled] = useState<{ email: string; totpSecret: string } | null>(null);

  const [health, setHealth] = useState<PlatformHealth | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) return;
    // Validate the stored session before trusting it - expired or revoked
    // tokens must return the visitor to sign-in, not the dashboard.
    void sessionIsValid(t).then((ok) => {
      if (ok) {
        sessionToken = t;
        setSignedIn(true);
        return;
      }
      sessionToken = '';
      sessionStorage.removeItem('votemax.session');
      sessionStorage.removeItem('votemax.user');
      sessionStorage.removeItem('votemax.org');
      sessionStorage.removeItem('votemax.assignments');
      setStatus('Your session has expired. Please sign in again.');
      setStatusKind('info');
    });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void refreshAll().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    if (!showNewOrg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewOrg(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNewOrg]);

  function isAuthzError(err: unknown): boolean {
    const code = friendlyFromUnknown(err).code;
    return code === 'FORBIDDEN' || code === 'AUTH_REQUIRED';
  }

  async function refreshAll() {
    try {
      const [tenants, h] = await Promise.all([
        get('/platform/organizations') as unknown as TenantRow[],
        get('/platform/health') as unknown as PlatformHealth,
      ]);
      setDirectory(Array.isArray(tenants) ? tenants : []);
      setHealth(h);
      setDenied(false);
    } catch (err) {
      if (isAuthzError(err)) setDenied(true);
      throw err;
    }
  }

  async function act(label: string, fn: () => Promise<void>) {
    setStatus(`${label}: working…`);
    setStatusKind('info');
    setLoading(true);
    try {
      await fn();
      setStatus('');
      setToast({ message: `${label} completed.`, kind: 'info' });
    } catch (err) {
      const f = friendlyFromUnknown(err);
      setStatus(f.message);
      setStatusKind(f.severity === 'guidance' ? 'info' : 'error');
      setToast(errorToast(err, `${label} - ${f.title}`));
      if (isAuthzError(err)) setDenied(true);
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    await act('Sign in', async () => {
      const data = await apiSignIn(email, password, totp || undefined);
      sessionToken = data.token;
      storeSession(data);
      setSignedIn(true);
    });
  }

  function signOut() {
    // Revokes the bearer session server-side, then clears local state.
    void apiSignOut();
    sessionToken = '';
    setSignedIn(false);
    setDirectory(null);
    setDetail(null);
    setHealth(null);
    setDenied(false);
  }

  async function openTenant(id: string, tab: DetailTab = 'overview') {
    setDetail(null);
    setEnrolled(null);
    setProvRole('organization_owner');
    setProvElection('');
    setDetailTab(tab);
    setSection('organizations');
    setDetailLoading(true);
    try {
      setDetail(await get(`/platform/organizations/${id}`) as unknown as TenantDetail);
    } catch (err) {
      setToast(errorToast(err, "Couldn't open this organization"));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeNewOrg() {
    setShowNewOrg(false);
    setOrgEnrollment(null);
  }

  async function createOrg() {
    await act('Create organization', async () => {
      const withAdmin = Boolean(orgAdminEmail);
      const res = await call('/organizations', {
        name: newOrgName, slug: newOrgSlug || slugify(newOrgName),
        ...(withAdmin ? {
          admin: {
            email: orgAdminEmail, displayName: orgAdminName || orgAdminEmail,
            password: orgAdminPassword, role: orgAdminRole,
          },
        } : {}),
      });
      const enr = res.adminEnrollment as { email?: string; role?: string; totpSecret?: string } | undefined;
      const enrollment = enr?.totpSecret ? { email: String(enr.email), role: String(enr.role), totpSecret: String(enr.totpSecret) } : null;
      setOrgEnrollment(enrollment);
      setNewOrgName(''); setNewOrgSlug(''); setSlugTouched(false);
      setOrgAdminEmail(''); setOrgAdminName(''); setOrgAdminPassword(''); setOrgAdminRole('organization_owner');
      // Keep the drawer open only when a one-time TOTP secret must be shown.
      if (!enrollment) setShowNewOrg(false);
      await refreshAll();
    });
  }

  async function provision() {
    if (!detail) return;
    await act('Provision admin', async () => {
      const res = await call(`/platform/organizations/${detail.id}/provision`, {
        email: provEmail, displayName: provName, password: provPassword,
        role: provRole, electionId: provElection || null,
      });
      const secret = { email: String(res.email ?? provEmail), totpSecret: String(res.totpSecret ?? '') };
      setProvEmail(''); setProvName(''); setProvPassword(''); setProvRole('organization_owner'); setProvElection('');
      await openTenant(detail.id, 'provision');
      setEnrolled(secret);
      await refreshAll();
    });
  }

  const totalElections = directory?.reduce((n, t) => n + t.electionCount, 0) ?? 0;
  const unstaffedTenants = (directory ?? []).filter((t) => !t.staffed);
  const recentTenants = [...(directory ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const TENANTS_PER_PAGE = 10;
  const filteredTenants = (directory ?? []).filter((t) =>
    (tenantFilter === 'all' || (tenantFilter === 'staffed') === t.staffed) &&
    `${t.name} ${t.slug}`.toLowerCase().includes(tenantQuery.trim().toLowerCase()));
  const tenantPageCount = Math.max(1, Math.ceil(filteredTenants.length / TENANTS_PER_PAGE));
  const tenantPageSafe = Math.min(tenantPage, tenantPageCount - 1);
  const tenantRows = filteredTenants.slice(tenantPageSafe * TENANTS_PER_PAGE, tenantPageSafe * TENANTS_PER_PAGE + TENANTS_PER_PAGE);

  async function copyVoterLink(slug: string) {
    const url = `${window.location.origin}/vote?org=${encodeURIComponent(slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: `Voter link copied: ${url}`, kind: 'info' });
    } catch {
      setToast({ message: `Voter link: ${url}`, kind: 'info' });
    }
  }

  if (!signedIn) {
    if (denied) {
      return (
        <AuthLayout eyebrow="Platform administration" title="Access denied">
          <Alert kind="error" title="Insufficient privileges">
            This account does not hold platform administration privileges. Tenant administrators should use the Administration page.
          </Alert>
          <div className="form-actions"><Button variant="secondary" onClick={signOut}>Sign out</Button></div>
        </AuthLayout>
      );
    }
    return (
      <AuthLayout eyebrow="Platform administration" title="Sign in to the console" lede="Control-plane access for platform administrators. Tenant election operations stay in Administration.">
        {status && <Alert kind={statusKind === 'error' ? 'error' : 'info'}>{status}</Alert>}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <Field label="Email" htmlFor="p-email"><Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
          <Field label="Password" htmlFor="p-password"><Input id="p-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="TOTP code" hint="Required for privileged accounts" htmlFor="p-totp"><Input id="p-totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} /></Field>
          <Button type="submit" variant="primary" size="lg" block disabled={loading || !email || !password}>Sign in</Button>
        </form>
      </AuthLayout>
    );
  }

  const current = SECTIONS.find((s) => s.id === section)!;
  const showingDetail = section === 'organizations' && (detail !== null || detailLoading);
  const devOtp = health?.otpProviders.devAllowed;
  const otpList = health ? [
    health.otpProviders.email ? 'Email' : null,
    health.otpProviders.smsAfricaTalking ? 'AT SMS' : null,
    health.otpProviders.smsWebhook ? 'SMS webhook' : null,
  ].filter(Boolean).join(', ') : '';

  const userLabel = (userId?: string) => {
    if (!userId) return '-';
    const u = detail?.users.find((x) => x.id === userId);
    return u ? u.email : userId.slice(0, 8);
  };

  const navItems = SECTIONS.map((x) => ({ id: x.id, label: x.label, icon: x.icon, badge: x.id === 'organizations' && directory ? directory.length : undefined }));

  const overlays = (
    <>
      {showNewOrg && (
        <>
          <div className="ps-drawer-backdrop" onClick={closeNewOrg} />
          <aside className="ps-drawer" role="dialog" aria-modal="true" aria-labelledby="new-org-title">
            <header className="ps-drawer-head">
              <div><h2 id="new-org-title">New organization</h2><p>Creates a tenant. Optionally staff it with its first administrator.</p></div>
              <button type="button" className="ps-icon-btn" aria-label="Close" onClick={closeNewOrg}><Icon name="close" /></button>
            </header>
            <div className="ps-drawer-body">
              {orgEnrollment && (
                <Alert kind="success" title="Organization created - share the TOTP secret once">
                  <p style={{ margin: '4px 0' }}><strong>{orgEnrollment.email}</strong> ({orgEnrollment.role}) - enroll this secret in their authenticator now; it is not shown again:</p>
                  <div style={{ margin: '8px 0' }}><TotpQr email={orgEnrollment.email} secret={orgEnrollment.totpSecret} /></div>
                  <p className="small" style={{ margin: '4px 0' }}>Can't scan? Enter this setup key instead:</p>
                  <code style={{ wordBreak: 'break-all' }}>{orgEnrollment.totpSecret}</code>
                  <p className="small" style={{ margin: '8px 0 0' }}>They sign in at <a href="/login">/login</a> with email, password and TOTP code.</p>
                </Alert>
              )}
              <h3 className="ps-form-heading">Organization</h3>
              <Field label="Name" htmlFor="org-name"><Input id="org-name" value={newOrgName} onChange={(e) => { setNewOrgName(e.target.value); if (!slugTouched) setNewOrgSlug(slugify(e.target.value)); }} placeholder="Example Organization" /></Field>
              <Field label="Slug" hint="Auto-generated from the name - used in voter-facing URLs" htmlFor="org-slug"><Input id="org-slug" value={newOrgSlug} onChange={(e) => { setSlugTouched(true); setNewOrgSlug(slugify(e.target.value)); }} placeholder="example-org" /></Field>

              <h3 className="ps-form-heading">First administrator <span>optional</span></h3>
              <p className="muted small">Leave blank to create an unstaffed tenant. When set, an MFA-enrolled account is created with the selected role.</p>
              <Field label="Admin email" htmlFor="org-admin-email"><Input id="org-admin-email" type="email" value={orgAdminEmail} onChange={(e) => setOrgAdminEmail(e.target.value)} placeholder="admin@org.org" /></Field>
              <Field label="Display name" htmlFor="org-admin-name"><Input id="org-admin-name" value={orgAdminName} onChange={(e) => setOrgAdminName(e.target.value)} /></Field>
              <Field label="Password" hint="Minimum 12 characters" htmlFor="org-admin-password"><Input id="org-admin-password" type="password" value={orgAdminPassword} onChange={(e) => setOrgAdminPassword(e.target.value)} autoComplete="new-password" /></Field>
              <Field label="Role" htmlFor="org-admin-role">
                <Select id="org-admin-role" value={orgAdminRole} onChange={(e) => setOrgAdminRole(e.target.value)}>
                  <option value="organization_owner">organization_owner - runs the tenant</option>
                  <option value="auditor">auditor - read-only oversight</option>
                </Select>
              </Field>
            </div>
            <footer className="ps-drawer-foot">
              <Button variant="secondary" onClick={closeNewOrg}>{orgEnrollment ? 'Done' : 'Cancel'}</Button>
              <Button onClick={() => void createOrg()} disabled={loading || !newOrgName || !newOrgSlug || (Boolean(orgAdminEmail) && orgAdminPassword.length < 12)}>Create organization</Button>
            </footer>
          </aside>
        </>
      )}

      <Toast message={toast?.message ?? null} kind={toast?.kind} title={toast?.title} hint={toast?.hint} onClose={() => setToast(null)} />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel="Confirm"
        onConfirm={() => { const c = confirm; setConfirm(null); c?.action(); }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );

  return (
    <ConsoleShell
      subtitle="Platform console"
      navLabel="Control plane"
      nav={navItems}
      active={section}
      onSelect={(id) => { setSection(id as Section); if (id === 'organizations') { setDetail(null); setDetailLoading(false); } }}
      footer={
        <>
          <div className="ps-env">
            <i className={`ps-dot ${health ? (health.store === 'memory' ? 'warn' : 'ok') : 'off'}`} />
            <span>{health ? (health.store === 'memory' ? 'In-memory store' : 'PostgreSQL connected') : 'Connecting…'}</span>
          </div>
          <button type="button" className="ps-signout" onClick={signOut}><Icon name="logout" /><span>Sign out</span></button>
        </>
      }
      title={showingDetail ? 'Organization' : current.title}
      description={showingDetail ? 'Staffing, elections and access for this tenant.' : current.blurb}
      actions={
        <>
          <button type="button" className="ps-icon-btn" aria-label="Refresh data" title="Refresh" onClick={() => void refreshAll().catch(() => undefined)} disabled={loading}><Icon name="refresh" /></button>
          <Button size="sm" onClick={() => { setSection('organizations'); setDetail(null); setDetailLoading(false); setShowNewOrg(true); }}><Icon name="plus" size={16} />New organization</Button>
        </>
      }
      after={overlays}
    >
      <>
        {statusKind === 'error' && status && <Alert kind="error">{status}</Alert>}
          {section === 'overview' && (
            <>
              {directory === null ? <Skeleton lines={4} /> : (
                <div className="ps-kpis">
                  <Kpi icon="building" label="Organizations" value={directory.length} note={`${directory.length - unstaffedTenants.length} staffed`} />
                  <Kpi icon="calendar" label="Elections" value={totalElections} note="across all tenants" tone="navy" />
                  <Kpi icon="alert" label="Unstaffed tenants" value={unstaffedTenants.length} note={unstaffedTenants.length ? 'Need an owner assigned' : 'All tenants staffed'} tone={unstaffedTenants.length ? 'amber' : 'green'} />
                  <Kpi icon="shield" label="Audit outbox" value={health ? health.pendingAuditEntries : '-'} note="entries awaiting chain commit" tone="green" />
                </div>
              )}

              <div className="ps-split">
                <div className="ps-stack">
                  {unstaffedTenants.length > 0 && (
                    <Panel title="Needs attention" subtitle="These organizations cannot run an election until an owner is provisioned.">
                      <ul className="ps-list">
                        {unstaffedTenants.map((t) => (
                          <li key={t.id}>
                            <span className="ps-avatar">{initials(t.name)}</span>
                            <div className="ps-list-main"><strong>{t.name}</strong><span>{t.slug}</span></div>
                            <Button size="sm" onClick={() => void openTenant(t.id, 'provision')}>Provision owner</Button>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  )}
                  <Panel
                    title="Recent organizations"
                    flush
                    actions={<Button size="sm" variant="ghost" onClick={() => setSection('organizations')}>View all</Button>}
                  >
                    {directory === null ? <div className="ps-panel-body"><Skeleton lines={3} /></div> : recentTenants.length === 0 ? (
                      <div className="ps-panel-body"><EmptyState title="No organizations yet">Create the first organization to get started.</EmptyState></div>
                    ) : (
                      <ul className="ps-list ps-list-flush">
                        {recentTenants.map((t) => (
                          <li key={t.id}>
                            <span className="ps-avatar">{initials(t.name)}</span>
                            <div className="ps-list-main"><strong>{t.name}</strong><span>{plural(t.userCount, 'user')} · {plural(t.electionCount, 'election')} · {fmtDay(t.createdAt)}</span></div>
                            {t.staffed ? <Badge tone="success">staffed</Badge> : <Badge tone="warning">unstaffed</Badge>}
                            <button type="button" className="ps-icon-btn" aria-label={`Manage ${t.name}`} onClick={() => void openTenant(t.id)}><Icon name="chevron" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>

                <Panel title="System status" subtitle={health ? `Checked ${fmtDate(health.checkedAt)}` : undefined}>
                  {!health ? <Skeleton lines={5} /> : (
                    <>
                      <StatusRow label="Storage" value={health.store} tone={health.store === 'memory' ? 'warn' : 'ok'} />
                      <StatusRow label="Database latency" value={`${health.dbLatencyMs} ms`} tone={health.dbLatencyMs > 500 ? 'warn' : 'ok'} />
                      <StatusRow label="OTP delivery" value={otpList || 'none configured'} tone={otpList ? 'ok' : 'warn'} />
                      <StatusRow label="Locked accounts" value={health.securitySignals.lockedAccounts} tone={health.securitySignals.lockedAccounts ? 'warn' : 'ok'} />
                      <StatusRow label="Uptime" value={fmtUptime(health.uptimeSeconds)} tone="ok" />
                      {devOtp && (
                        <Alert kind="warning" title="Dev OTP outbox active">Codes are captured in-process, not delivered. Disable before any real election.</Alert>
                      )}
                    </>
                  )}
                </Panel>
              </div>
            </>
          )}

          {section === 'organizations' && !showingDetail && (
            <Panel flush>
              <div className="ps-toolbar">
                <label className="ps-search">
                  <Icon name="search" size={16} />
                  <input
                    value={tenantQuery} placeholder="Search by name or slug…" aria-label="Search organizations"
                    onChange={(e) => { setTenantQuery(e.target.value); setTenantPage(0); }}
                  />
                </label>
                <div className="ps-segmented" role="group" aria-label="Filter by staffing">
                  {(['all', 'staffed', 'unstaffed'] as const).map((f) => (
                    <button key={f} type="button" className={tenantFilter === f ? 'active' : ''} aria-pressed={tenantFilter === f}
                      onClick={() => { setTenantFilter(f); setTenantPage(0); }}>
                      {f === 'all' ? 'All' : f === 'staffed' ? 'Staffed' : 'Unstaffed'}
                    </button>
                  ))}
                </div>
                <span className="ps-count">{filteredTenants.length}{tenantQuery || tenantFilter !== 'all' ? ` of ${directory?.length ?? 0}` : ''} organizations</span>
              </div>

              {directory === null ? <div className="ps-panel-body"><Skeleton lines={5} /></div> : directory.length === 0 ? (
                <div className="ps-panel-body">
                  <EmptyState title="No organizations yet">Create the first organization to get started.</EmptyState>
                  <div className="ps-center"><Button onClick={() => setShowNewOrg(true)}><Icon name="plus" size={16} />New organization</Button></div>
                </div>
              ) : tenantRows.length === 0 ? (
                <div className="ps-panel-body"><EmptyState title="No matching organizations">Adjust the search or filter.</EmptyState></div>
              ) : (
                <div className="ps-table-wrap">
                  <table className="ps-table">
                    <thead>
                      <tr><th>Organization</th><th>Status</th><th className="num hide-sm">Users</th><th className="num hide-sm">Elections</th><th className="hide-sm">Created</th><th aria-label="Actions" /></tr>
                    </thead>
                    <tbody>
                      {tenantRows.map((t) => (
                        <tr key={t.id} onClick={() => void openTenant(t.id)}>
                          <td>
                            <div className="ps-org-cell">
                              <span className="ps-avatar">{initials(t.name)}</span>
                              <div><strong>{t.name}</strong><span>{t.slug}</span></div>
                            </div>
                          </td>
                          <td>{t.staffed ? <Badge tone="success">staffed</Badge> : <Badge tone="warning">unstaffed</Badge>}</td>
                          <td className="num hide-sm">{t.userCount}</td>
                          <td className="num hide-sm" title={Object.entries(t.electionsByState).map(([s, n]) => `${s} ×${n}`).join(', ')}>{t.electionCount}</td>
                          <td className="hide-sm muted">{fmtDay(t.createdAt)}</td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="ps-icon-btn hide-sm" aria-label={`Copy voter link for ${t.name}`} title="Copy voter link" onClick={() => void copyVoterLink(t.slug)}><Icon name="link" /></button>
                            <Button size="sm" variant="secondary" onClick={() => void openTenant(t.id)}>Manage</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tenantPageCount > 1 && (
                <div className="ps-pager">
                  <span className="small muted">Page {tenantPageSafe + 1} of {tenantPageCount}</span>
                  <div>
                    <Button size="sm" variant="secondary" disabled={tenantPageSafe === 0} onClick={() => setTenantPage(tenantPageSafe - 1)}>Previous</Button>{' '}
                    <Button size="sm" variant="secondary" disabled={tenantPageSafe >= tenantPageCount - 1} onClick={() => setTenantPage(tenantPageSafe + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {showingDetail && (
            detailLoading || !detail ? <Skeleton lines={6} /> : (
              <>
                <div className="ps-detail-head">
                  <button type="button" className="ps-back" onClick={() => { setDetail(null); }}><Icon name="back" size={16} />Organizations</button>
                  <div className="ps-detail-title">
                    <span className="ps-avatar ps-avatar-lg">{initials(detail.name)}</span>
                    <div>
                      <h2>{detail.name}</h2>
                      <p><code>{detail.slug}</code> · created {fmtDay(detail.createdAt)}</p>
                    </div>
                    {detail.roleAssignments.some((a) => a.role === 'organization_owner') ? <Badge tone="success">staffed</Badge> : <Badge tone="warning">unstaffed</Badge>}
                  </div>
                  <div className="ps-detail-actions">
                    <Button size="sm" variant="secondary" onClick={() => void copyVoterLink(detail.slug)}><Icon name="link" size={16} />Copy voter link</Button>
                    <Button size="sm" onClick={() => setDetailTab('provision')}><Icon name="key" size={16} />Provision staff</Button>
                  </div>
                </div>

                <div className="ps-tabs" role="tablist">
                  {DETAIL_TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={detailTab === t.id} className={detailTab === t.id ? 'active' : ''} onClick={() => setDetailTab(t.id)}>
                      {t.label}
                      {t.id === 'users' && <em>{detail.users.length}</em>}
                      {t.id === 'elections' && <em>{detail.elections.length}</em>}
                      {t.id === 'roles' && <em>{detail.roleAssignments.length}</em>}
                    </button>
                  ))}
                </div>

                {detailTab === 'overview' && (
                  <div className="ps-kpis ps-kpis-3">
                    <Kpi icon="users" label="Users" value={detail.users.length} note={`${detail.users.filter((u) => u.mfaEnrolled).length} with MFA`} />
                    <Kpi icon="calendar" label="Elections" value={detail.elections.length} tone="navy" note={Object.entries(countBy(detail.elections.map((e) => e.state))).map(([s, n]) => `${s.toLowerCase()} ${n}`).join(' · ') || 'none yet'} />
                    <Kpi icon="key" label="Role assignments" value={detail.roleAssignments.length} tone="green" />
                  </div>
                )}

                {detailTab === 'users' && (
                  <Panel flush>
                    {detail.users.length === 0 ? <div className="ps-panel-body"><EmptyState title="No users yet">Provision a staff account to get started.</EmptyState></div> : (
                      <div className="ps-table-wrap">
                        <table className="ps-table">
                          <thead><tr><th>User</th><th>MFA</th></tr></thead>
                          <tbody>
                            {detail.users.map((u) => (
                              <tr key={u.id}>
                                <td><div className="ps-org-cell"><span className="ps-avatar">{initials(u.displayName)}</span><div><strong>{u.displayName}</strong><span>{u.email}</span></div></div></td>
                                <td>{u.mfaEnrolled ? <Badge tone="success">enrolled</Badge> : <Badge tone="warning">none</Badge>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                )}

                {detailTab === 'elections' && (
                  <Panel flush>
                    {detail.elections.length === 0 ? <div className="ps-panel-body"><EmptyState title="No elections">This organization has not created an election yet.</EmptyState></div> : (
                      <Table head={['Election', 'State', 'Voting window']}>
                        {detail.elections.map((e) => (
                          <tr key={e.id}>
                            <td><strong>{e.name}</strong></td>
                            <td><Badge tone={electionPill(e.state)}>{e.state}</Badge></td>
                            <td className="small muted">{fmtDate(e.votingOpensAt)} → {fmtDate(e.votingClosesAt)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </Panel>
                )}

                {detailTab === 'roles' && (
                  <Panel flush>
                    {detail.roleAssignments.length === 0 ? <div className="ps-panel-body"><EmptyState title="No role assignments" /></div> : (
                      <Table head={['User', 'Role', 'Scope']}>
                        {detail.roleAssignments.map((a, i) => (
                          <tr key={i}>
                            <td>{userLabel(a.userId)}</td>
                            <td><Badge tone="navy">{a.role}</Badge></td>
                            <td className="small muted">{a.electionId ? `election ${a.electionId.slice(0, 8)}` : 'organization-wide'}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </Panel>
                )}

                {detailTab === 'provision' && (
                  <Panel title="Provision staff account" subtitle="Creates an MFA-enrolled user and assigns the selected tenant role. Scope non-owner roles to one election for least privilege.">
                    {enrolled && (
                      <Alert kind="success" title="Account provisioned - share the TOTP secret once">
                        <p style={{ margin: '4px 0' }}><strong>{enrolled.email}</strong> - enroll this secret in their authenticator now; it is not shown again:</p>
                        <div style={{ margin: '8px 0' }}><TotpQr email={enrolled.email} secret={enrolled.totpSecret} /></div>
                        <p className="small" style={{ margin: '4px 0' }}>Can't scan? Enter this setup key instead:</p>
                        <code style={{ wordBreak: 'break-all' }}>{enrolled.totpSecret}</code>
                        <p className="small" style={{ margin: '8px 0 0' }}>They sign in at <a href="/login">/login</a> with email, password and TOTP code.</p>
                      </Alert>
                    )}
                    <div className="form-grid">
                      <Field label="Email" htmlFor="prov-email"><Input id="prov-email" type="email" value={provEmail} onChange={(e) => setProvEmail(e.target.value)} /></Field>
                      <Field label="Display name" htmlFor="prov-name"><Input id="prov-name" value={provName} onChange={(e) => setProvName(e.target.value)} /></Field>
                      <Field label="Password" hint="Minimum 12 characters" htmlFor="prov-password"><Input id="prov-password" type="password" value={provPassword} onChange={(e) => setProvPassword(e.target.value)} autoComplete="new-password" /></Field>
                      <Field label="Role" htmlFor="prov-role">
                        <Select id="prov-role" value={provRole} onChange={(e) => setProvRole(e.target.value)}>
                          <option value="organization_owner">organization_owner - runs the tenant</option>
                          <option value="auditor">auditor - read-only oversight</option>
                        </Select>
                      </Field>
                      <Field label="Election scope" hint="Organization-wide applies to every election" htmlFor="prov-election">
                        <Select id="prov-election" value={provElection} onChange={(e) => setProvElection(e.target.value)} disabled={detail.elections.length === 0}>
                          <option value="">Organization-wide</option>
                          {detail.elections.map((el) => <option key={el.id} value={el.id}>{el.name} ({el.state})</option>)}
                        </Select>
                      </Field>
                    </div>
                    <div className="form-actions">
                      <Button
                        disabled={loading || !provEmail || !provName || provPassword.length < 12}
                        onClick={() => setConfirm({
                          title: 'Provision staff account',
                          message: <>Create <strong>{provEmail}</strong> as <code>{provRole}</code>{provElection ? ' scoped to one election' : ' (organization-wide)'} in <strong>{detail.name}</strong>? They will receive a one-time TOTP secret.</>,
                          action: () => void provision(),
                        })}
                      >
                        Provision account
                      </Button>
                    </div>
                  </Panel>
                )}
              </>
            )
          )}

          {section === 'health' && (
            !health ? <Skeleton lines={5} /> : (
              <>
                <div className="ps-kpis">
                  <Kpi icon="pulse" label="Store backend" value={health.store} note={health.store === 'memory' ? 'NOT durable - dev/test only' : 'PostgreSQL'} tone={health.store === 'memory' ? 'amber' : 'green'} />
                  <Kpi icon="refresh" label="DB latency" value={`${health.dbLatencyMs} ms`} tone="navy" />
                  <Kpi icon="shield" label="Audit outbox" value={health.pendingAuditEntries} note="awaiting hash-chain commit" tone="green" />
                  <Kpi icon="calendar" label="Uptime" value={fmtUptime(health.uptimeSeconds)} note={`checked ${fmtDate(health.checkedAt)}`} />
                </div>

                <div className="ps-split ps-split-even">
                  <Panel title="OTP delivery providers" flush>
                    <Table head={['Channel', 'Provider', 'Configured']}>
                      <tr><td>Email</td><td className="muted">{health.otpProviders.emailVia ? (health.otpProviders.emailVia === 'smtp' ? 'SMTP (SMTP_HOST)' : `${health.otpProviders.emailVia} API (EMAIL_API_KEY)`) : 'EMAIL_API_KEY or SMTP_HOST'}</td><td>{health.otpProviders.email ? <Badge tone="success">yes</Badge> : <Badge tone="error">no</Badge>}</td></tr>
                      <tr><td>SMS</td><td className="muted">Africa&apos;s Talking</td><td>{health.otpProviders.smsAfricaTalking ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>}</td></tr>
                      <tr><td>SMS</td><td className="muted">Generic webhook</td><td>{health.otpProviders.smsWebhook ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>}</td></tr>
                      <tr><td>Fallback</td><td className="muted">In-process dev outbox</td><td>{health.otpProviders.devAllowed ? <Badge tone="warning">enabled</Badge> : <Badge tone="success">disabled</Badge>}</td></tr>
                    </Table>
                    {health.otpProviders.devAllowed && (
                      <div className="ps-panel-body"><Alert kind="warning" title="F-04 open">No production OTP provider is confirmed. Dev outbox is active - codes are captured in-process, not delivered.</Alert></div>
                    )}
                  </Panel>

                  <Panel title="Security signals" subtitle={`${health.securitySignals.scope}. Abuse-detection counters, not correctness state.`}>
                    <StatusRow label="Login failure buckets" value={health.securitySignals.loginFailureBuckets} tone="off" />
                    <StatusRow label="Locked accounts (5-min window)" value={health.securitySignals.lockedAccounts} tone={health.securitySignals.lockedAccounts ? 'warn' : 'ok'} />
                    <StatusRow label="OTP request buckets" value={health.securitySignals.otpRequestBuckets} tone="off" />
                    <StatusRow label="OTP verify failures" value={health.securitySignals.otpVerifyFailureBuckets} tone="off" />
                  </Panel>

                  <Panel title="Email &amp; SMS delivery" subtitle="Most recent delivery problem since the API last started.">
                    {([['Invitations and reminders', health.delivery?.invitations], ['Verification codes', health.delivery?.codes]] as const).map(([label, err]) => (
                      <div key={label} className="ps-status-row" style={{ alignItems: 'flex-start' }}>
                        <span className="ps-status-label"><i className={`ps-dot ${err ? 'bad' : 'ok'}`} />{label}</span>
                        <span className="ps-status-value" style={{ fontWeight: 500, maxWidth: '60%' }}>
                          {!health.delivery ? 'Not reported - the API needs the latest deploy'
                            : err ? (<>{err.channel} failed: {err.message}<div className="small muted">{fmtDate(err.at)}</div></>)
                            : 'No problems since start'}
                        </span>
                      </div>
                    ))}
                  </Panel>
                </div>
              </>
            )
          )}
      </>
    </ConsoleShell>
  );
}
