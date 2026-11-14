'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input,
  Select, Skeleton, Stat, Table, Toast,
} from '../../components/ui';
import { fraudHeaders } from '../../lib/fraud';
import { API, sessionIsValid, signIn as apiSignIn, signOut as apiSignOut, storeSession } from '../../lib/auth';

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

type Section = 'overview' | 'organizations' | 'health';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'health', label: 'Platform health' },
];

interface TenantRow {
  id: string; name: string; slug: string; createdAt: string;
  userCount: number; electionCount: number;
  electionsByState: Record<string, number>;
  staffed: boolean;
}
interface TenantDetail extends Omit<TenantRow, 'staffed'> {
  users: { id: string; email: string; displayName: string; mfaEnrolled: boolean }[];
  elections: { id: string; name: string; state: string; votingOpensAt: string | null; votingClosesAt: string | null }[];
  roleAssignments: { userId?: string; role: string; electionId: string | null; stationId: string | null }[];
}
interface PlatformHealth {
  store: string; dbLatencyMs: number; pendingAuditEntries: number;
  uptimeSeconds: number; checkedAt: string;
  otpProviders: { email: boolean; smsAfricaTalking: boolean; smsWebhook: boolean; devAllowed: boolean };
  securitySignals: {
    loginFailureBuckets: number; lockedAccounts: number;
    otpRequestBuckets: number; otpVerifyFailureBuckets: number; scope: string;
  };
}

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : '—';
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
  const [mobileNav, setMobileNav] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);
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

  // New organization
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
    // Validate the stored session before trusting it — expired or revoked
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

  function isAuthzError(err: unknown): boolean {
    const m = err instanceof Error ? err.message : '';
    return m.includes('FORBIDDEN') || m.includes('AUTH_REQUIRED');
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
      setStatus(`${label}: done.`);
      setToast({ message: `${label} completed.`, kind: 'info' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      setStatus(`${label}: ${message}`);
      setStatusKind('error');
      setToast({ message: `${label} failed: ${message}`, kind: 'error' });
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

  async function openTenant(id: string) {
    setDetail(null);
    setEnrolled(null);
    setProvRole('organization_owner');
    setProvElection('');
    const d = await get(`/platform/organizations/${id}`) as unknown as TenantDetail;
    setDetail(d);
    setSection('organizations');
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
      setOrgEnrollment(enr?.totpSecret ? { email: String(enr.email), role: String(enr.role), totpSecret: String(enr.totpSecret) } : null);
      setNewOrgName(''); setNewOrgSlug(''); setSlugTouched(false);
      setOrgAdminEmail(''); setOrgAdminName(''); setOrgAdminPassword(''); setOrgAdminRole('organization_owner');
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
      setEnrolled({ email: String(res.email ?? provEmail), totpSecret: String(res.totpSecret ?? '') });
      setProvEmail(''); setProvName(''); setProvPassword(''); setProvRole('organization_owner'); setProvElection('');
      await openTenant(detail.id);
      await refreshAll();
    });
  }

  const totalElections = directory?.reduce((n, t) => n + t.electionCount, 0) ?? 0;
  const unstaffed = directory?.filter((t) => !t.staffed).length ?? 0;

  const TENANTS_PER_PAGE = 8;
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
    return (
      <main className="auth-page">
        <div className="auth-card">
          {denied ? (
            <>
              <p className="eyebrow">Platform administration</p>
              <h1>Access denied</h1>
              <Alert kind="error" title="Insufficient privileges">
                This account does not hold platform administration privileges. Tenant administrators should use the Administration page.
              </Alert>
              <div className="form-actions"><Button variant="secondary" onClick={signOut}>Sign out</Button></div>
            </>
          ) : (
            <>
              <p className="eyebrow">Platform administration</p>
              <h1>Sign in</h1>
              <p className="lede">Control-plane access for platform administrators. Tenant election operations stay in Administration.</p>
              {status && <Alert kind={statusKind === 'error' ? 'error' : 'info'}>{status}</Alert>}
              <Card title="Platform admin sign in">
                <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
                  <Field label="Email" htmlFor="p-email"><Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
                  <Field label="Password" htmlFor="p-password"><Input id="p-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
                  <Field label="TOTP code" hint="Required for privileged accounts" htmlFor="p-totp"><Input id="p-totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} /></Field>
                  <Button type="submit" variant="primary" block disabled={loading || !email || !password}>Sign in</Button>
                </form>
              </Card>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="admin-brand">VoteMax Platform</div>
        <nav className="admin-nav" aria-label="Platform sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={section === s.id ? 'active' : ''} onClick={() => { setSection(s.id); setMobileNav(false); }}>
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      {mobileNav && <div className="drawer-backdrop" onClick={() => setMobileNav(false)} />}

      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <Button variant="secondary" size="sm" className="nav-toggle" onClick={() => setMobileNav((v) => !v)}>Sections</Button>
            <h1>Platform administration</h1>
            <div className="breadcrumbs">
              <a href="/">Home</a><span>/</span><span>Platform</span><span>/</span><span>{SECTIONS.find((s) => s.id === section)?.label}</span>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Tenant governance and platform operations. Read-mostly by design; every action is audit-logged.</p>
          </div>
          <div className="card-actions">
            <Badge tone="success">Signed in</Badge>
            <Button variant="ghost" size="sm" onClick={() => void refreshAll().catch(() => undefined)} disabled={loading}>Refresh</Button>
            <Button variant="secondary" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>

        {status && <Alert kind={statusKind === 'error' ? 'error' : 'info'}>{status}</Alert>}

        <div className="admin-content">
      {section === 'overview' && (
        <>
          {directory === null ? <Skeleton lines={4} /> : (
            <div className="stat-grid">
              <Stat label="Organizations" value={directory.length} />
              <Stat label="Elections" value={totalElections} />
              <Stat label="Unstaffed tenants" value={unstaffed} note="No owner, chair, or election admin assigned" />
              <Stat label="Audit outbox" value={health ? health.pendingAuditEntries : '—'} note={health ? `store: ${health.store}` : undefined} />
            </div>
          )}
          {health && (
            <Card title="Platform health">
              <div className="stat-grid">
                <Stat label="Store" value={health.store} note={`db ${health.dbLatencyMs}ms`} />
                <Stat label="OTP providers" value={[
                  health.otpProviders.email ? 'email' : null,
                  health.otpProviders.smsAfricaTalking ? 'AT SMS' : null,
                  health.otpProviders.smsWebhook ? 'SMS webhook' : null,
                ].filter(Boolean).join(', ') || 'none'} note={health.otpProviders.devAllowed ? 'dev outbox enabled (non-production)' : 'dev outbox disabled'} />
                <Stat label="Locked accounts" value={health.securitySignals.lockedAccounts} note={`${health.securitySignals.loginFailureBuckets} login buckets · ${health.securitySignals.scope}`} />
                <Stat label="Uptime" value={`${Math.floor(health.uptimeSeconds / 60)}m`} note={`checked ${fmtDate(health.checkedAt)}`} />
              </div>
              {health.otpProviders.devAllowed && (
                <Alert kind="warning" title="Development OTP outbox active">OTP codes are being captured in-process instead of delivered. This must be disabled before any real election.</Alert>
              )}
            </Card>
          )}
        </>
      )}

      {section === 'organizations' && (
        <>
          <Card title="New organization">
            <p className="muted small" style={{ marginTop: 0 }}>Creates a tenant. Optionally staff it immediately with its first administrator below — otherwise use “Provision admin” on the tenant afterwards.</p>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label="Name" htmlFor="org-name"><Input id="org-name" value={newOrgName} onChange={(e) => { setNewOrgName(e.target.value); if (!slugTouched) setNewOrgSlug(slugify(e.target.value)); }} placeholder="Example Organization" /></Field>
              <Field label="Slug" hint="Auto-generated from the name — used in voter-facing URLs" htmlFor="org-slug"><Input id="org-slug" value={newOrgSlug} onChange={(e) => { setSlugTouched(true); setNewOrgSlug(slugify(e.target.value)); }} placeholder="example-org" /></Field>
            </div>
            <h3 style={{ marginTop: 16 }}>First administrator (optional)</h3>
            <p className="muted small">Leave blank to create an unstaffed tenant. When set, an MFA-enrolled account is created and assigned the selected role.</p>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label="Admin email" htmlFor="org-admin-email"><Input id="org-admin-email" type="email" value={orgAdminEmail} onChange={(e) => setOrgAdminEmail(e.target.value)} placeholder="admin@org.org" /></Field>
              <Field label="Display name" htmlFor="org-admin-name"><Input id="org-admin-name" value={orgAdminName} onChange={(e) => setOrgAdminName(e.target.value)} /></Field>
              <Field label="Password" hint="Minimum 12 characters" htmlFor="org-admin-password"><Input id="org-admin-password" type="password" value={orgAdminPassword} onChange={(e) => setOrgAdminPassword(e.target.value)} autoComplete="new-password" /></Field>
              <Field label="Role" htmlFor="org-admin-role">
                <Select id="org-admin-role" value={orgAdminRole} onChange={(e) => setOrgAdminRole(e.target.value)}>
                  <option value="organization_owner">organization_owner — full tenant staffing</option>
                  <option value="committee_chair">committee_chair — readiness, certify</option>
                  <option value="election_admin">election_admin — configure, tally, publish</option>
                  <option value="voter_registrar">voter_registrar — register management</option>
                  <option value="auditor">auditor — verify, read-only oversight</option>
                  <option value="observer">observer — participation aggregates</option>
                </Select>
              </Field>
            </div>
            {orgEnrollment && (
              <Alert kind="success" title="Organization created with admin — share the TOTP secret once">
                <p style={{ margin: '4px 0' }}><strong>{orgEnrollment.email}</strong> ({orgEnrollment.role}) — enroll this secret in their authenticator now; it is not shown again:</p>
                <code>{orgEnrollment.totpSecret}</code>
                <p className="small" style={{ margin: '8px 0 0' }}>The administrator signs in at <a href="/login">/login</a> with their email, password, and TOTP code.</p>
              </Alert>
            )}
            <div className="form-actions">
              <Button onClick={() => void createOrg()} disabled={loading || !newOrgName || !newOrgSlug || (Boolean(orgAdminEmail) && orgAdminPassword.length < 12)}>Create organization</Button>
            </div>
          </Card>

          <Card title="Tenants" actions={<Badge tone="neutral">{filteredTenants.length}{tenantQuery || tenantFilter !== 'all' ? ` of ${directory?.length ?? 0}` : ''}</Badge>}>
            {directory === null ? <Skeleton lines={4} /> : directory.length === 0 ? (
              <EmptyState title="No organizations yet">Create the first organization above.</EmptyState>
            ) : (
              <>
                <div className="inline-form" style={{ marginBottom: 14 }}>
                  <Field label="Search" htmlFor="tenant-search">
                    <Input id="tenant-search" value={tenantQuery} onChange={(e) => { setTenantQuery(e.target.value); setTenantPage(0); }} placeholder="Name or slug…" />
                  </Field>
                  <Field label="Staffing" htmlFor="tenant-filter">
                    <Select id="tenant-filter" value={tenantFilter} onChange={(e) => { setTenantFilter(e.target.value as typeof tenantFilter); setTenantPage(0); }}>
                      <option value="all">All tenants</option>
                      <option value="staffed">Staffed</option>
                      <option value="unstaffed">Unstaffed</option>
                    </Select>
                  </Field>
                </div>
                {tenantRows.length === 0 ? (
                  <EmptyState title="No matching organizations">Adjust the search or filter.</EmptyState>
                ) : (
                  <Table head={['Name', 'Slug', 'Created', 'Users', 'Elections', 'States', 'Staffed', '']}>
                    {tenantRows.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td className="muted">{t.slug}</td>
                        <td className="muted small">{fmtDate(t.createdAt)}</td>
                        <td>{t.userCount}</td>
                        <td>{t.electionCount}</td>
                        <td className="small">{Object.entries(t.electionsByState).map(([s, n]) => `${s}×${n}`).join(' ') || '—'}</td>
                        <td>{t.staffed ? <Badge tone="success">staffed</Badge> : <Badge tone="warning">unstaffed</Badge>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Button size="sm" variant="secondary" onClick={() => void openTenant(t.id)}>Manage</Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => void copyVoterLink(t.slug)}>Voter link</Button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
                {tenantPageCount > 1 && (
                  <div className="form-actions" style={{ marginTop: 14 }}>
                    <Button size="sm" variant="secondary" disabled={tenantPageSafe === 0} onClick={() => setTenantPage(tenantPageSafe - 1)}>← Prev</Button>
                    <span className="small muted">Page {tenantPageSafe + 1} of {tenantPageCount}</span>
                    <Button size="sm" variant="secondary" disabled={tenantPageSafe >= tenantPageCount - 1} onClick={() => setTenantPage(tenantPageSafe + 1)}>Next →</Button>
                  </div>
                )}
              </>
            )}
          </Card>

          {detail && (
            <Card title={`${detail.name} — detail`}>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <Stat label="Users" value={detail.users.length} />
                <Stat label="Elections" value={detail.elections.length} />
                <Stat label="Role assignments" value={detail.roleAssignments.length} />
                <Stat label="Slug" value={detail.slug} />
              </div>

              {enrolled && (
                <Alert kind="success" title="Admin provisioned — share the TOTP secret once">
                  <p style={{ margin: '4px 0' }}><strong>{enrolled.email}</strong> — enroll this secret in their authenticator now; it is not shown again:</p>
                  <code>{enrolled.totpSecret}</code>
                  <p className="small" style={{ margin: '8px 0 0' }}>The administrator signs in at <a href="/login">/login</a> with their email, password, and TOTP code.</p>
                </Alert>
              )}

              <h3>Provision staff account</h3>
              <p className="muted small">Creates an MFA-enrolled user and assigns the selected tenant role. <code>organization_owner</code> can assign all other tenant roles; scope other roles to one election for least privilege.</p>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <Field label="Email" htmlFor="prov-email"><Input id="prov-email" type="email" value={provEmail} onChange={(e) => setProvEmail(e.target.value)} /></Field>
                <Field label="Display name" htmlFor="prov-name"><Input id="prov-name" value={provName} onChange={(e) => setProvName(e.target.value)} /></Field>
                <Field label="Password" hint="Minimum 12 characters" htmlFor="prov-password"><Input id="prov-password" type="password" value={provPassword} onChange={(e) => setProvPassword(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Role" htmlFor="prov-role">
                  <Select id="prov-role" value={provRole} onChange={(e) => setProvRole(e.target.value)}>
                    <option value="organization_owner">organization_owner — full tenant staffing</option>
                    <option value="election_admin">election_admin — configure, tally, publish</option>
                    <option value="committee_chair">committee_chair — readiness, certify</option>
                    <option value="voter_registrar">voter_registrar — register management</option>
                    <option value="auditor">auditor — verify, read-only oversight</option>
                    <option value="observer">observer — participation aggregates</option>
                  </Select>
                </Field>
                <Field label="Election scope" hint="Org-wide applies to every election" htmlFor="prov-election">
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

              <h3>Users</h3>
              {detail.users.length === 0 ? <p className="muted small">No users yet.</p> : (
                <Table head={['Email', 'Name', 'MFA']}>
                  {detail.users.map((u) => (
                    <tr key={u.id}><td>{u.email}</td><td>{u.displayName}</td><td>{u.mfaEnrolled ? <Badge tone="success">enrolled</Badge> : <Badge tone="warning">none</Badge>}</td></tr>
                  ))}
                </Table>
              )}

              <h3>Elections</h3>
              {detail.elections.length === 0 ? <p className="muted small">No elections.</p> : (
                <Table head={['Name', 'State', 'Window']}>
                  {detail.elections.map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td><Badge tone={electionPill(e.state)}>{e.state}</Badge></td>
                      <td className="small muted">{fmtDate(e.votingOpensAt)} → {fmtDate(e.votingClosesAt)}</td>
                    </tr>
                  ))}
                </Table>
              )}

              <h3>Role assignments</h3>
              {detail.roleAssignments.length === 0 ? <p className="muted small">No role assignments.</p> : (
                <Table head={['User', 'Role', 'Election', 'Station']}>
                  {detail.roleAssignments.map((a, i) => (
                    <tr key={i}>
                      <td className="small">{a.userId ? a.userId.slice(0, 8) : '—'}</td>
                      <td><Badge tone="navy">{a.role}</Badge></td>
                      <td className="small muted">{a.electionId ? a.electionId.slice(0, 8) : 'org-wide'}</td>
                      <td className="small muted">{a.stationId ? a.stationId.slice(0, 8) : '—'}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}
        </>
      )}

      {section === 'health' && (
        <>
          {!health ? <Skeleton lines={4} /> : (
            <>
              <div className="stat-grid">
                <Stat label="Store backend" value={health.store} note={health.store === 'memory' ? 'NOT durable — dev/test only (F-01)' : 'PostgreSQL'} />
                <Stat label="DB latency" value={`${health.dbLatencyMs}ms`} />
                <Stat label="Audit outbox pending" value={health.pendingAuditEntries} note="Entries awaiting hash-chain commit" />
                <Stat label="Process uptime" value={`${Math.floor(health.uptimeSeconds / 60)}m ${health.uptimeSeconds % 60}s`} />
              </div>

              <Card title="OTP delivery providers">
                <Table head={['Channel', 'Provider', 'Configured']}>
                  <tr><td>Email (SMTP)</td><td className="muted">SMTP_HOST</td><td>{health.otpProviders.email ? <Badge tone="success">yes</Badge> : <Badge tone="error">no</Badge>}</td></tr>
                  <tr><td>SMS</td><td className="muted">Africa's Talking (AT_API_KEY)</td><td>{health.otpProviders.smsAfricaTalking ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>}</td></tr>
                  <tr><td>SMS</td><td className="muted">Generic webhook (SMS_WEBHOOK_URL)</td><td>{health.otpProviders.smsWebhook ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>}</td></tr>
                  <tr><td>Dev fallback</td><td className="muted">In-process outbox</td><td>{health.otpProviders.devAllowed ? <Badge tone="warning">enabled</Badge> : <Badge tone="success">disabled</Badge>}</td></tr>
                </Table>
                {health.otpProviders.devAllowed && (
                  <Alert kind="warning" title="F-04 open">No production OTP provider is confirmed. Dev outbox is active — codes are captured in-process, not delivered. Production requires real provider credentials and a delivery verification rehearsal.</Alert>
                )}
              </Card>

              <Card title="Security signals">
                <div className="stat-grid">
                  <Stat label="Login failure buckets" value={health.securitySignals.loginFailureBuckets} />
                  <Stat label="Locked accounts" value={health.securitySignals.lockedAccounts} note="5-minute lockout window" />
                  <Stat label="OTP request buckets" value={health.securitySignals.otpRequestBuckets} />
                  <Stat label="OTP verify failures" value={health.securitySignals.otpVerifyFailureBuckets} />
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>{health.securitySignals.scope}. These are abuse-detection counters, not correctness state.</p>
              </Card>

              <p className="muted small">Last checked {fmtDate(health.checkedAt)}. Liveness only — database readiness is exercised by the latency probe above.</p>
            </>
          )}
        </>
      )}

        </div>

        <Toast message={toast?.message ?? null} kind={toast?.kind} onClose={() => setToast(null)} />
        <ConfirmDialog
          open={confirm !== null}
          title={confirm?.title ?? ''}
          message={confirm?.message}
          confirmLabel="Confirm"
          onConfirm={() => { const c = confirm; setConfirm(null); c?.action(); }}
          onCancel={() => setConfirm(null)}
        />
      </main>
    </div>
  );
}
