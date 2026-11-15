'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Skeleton } from '../../components/ui';
import { fraudHeaders } from '../../lib/fraud';
import { apiRequest } from '../../lib/http';
import { AppError, friendlyFromUnknown, networkError, toFriendly, type FriendlyError } from '../../lib/errors';
import { Icon } from '../../components/icons';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface BallotData {
  election: { id: string; name: string };
  positions: {
    id: string; title: string; maxChoices: number; allowAbstain: boolean;
    candidates: { id: string; fullName: string; statement: string | null }[];
  }[];
}

interface PublicElection {
  id: string; name: string; state: string;
  votingOpensAt: string | null; votingClosesAt: string | null;
}

async function call(path: string, body: unknown): Promise<Record<string, unknown>> {
  return apiRequest(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await fraudHeaders()) },
    body: JSON.stringify(body),
  });
}

async function getJson(path: string): Promise<unknown> {
  // List endpoints return JSON arrays, which apiRequest's object type can't express.
  let res: Response;
  try { res = await fetch(`${API}${path}`, { headers: await fraudHeaders() }); } catch (err) {
    throw new AppError(networkError(err instanceof Error ? err.message : undefined));
  }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as Record<string, unknown>).message;
    throw new AppError(toFriendly(typeof m === 'string' ? m : `HTTP ${res.status}`, res.status), res.status);
  }
  return data;
}

type Step = 'identify' | 'code' | 'ballot' | 'review' | 'done';
const STEP_ORDER: Step[] = ['identify', 'code', 'ballot', 'review', 'done'];
const STEP_LABELS = ['Find election', 'Verify', 'Ballot', 'Review', 'Done'];

function statePill(state: string): 'success' | 'warning' | 'error' | 'accent' | 'neutral' {
  if (state === 'OPEN') return 'success';
  if (state === 'CLOSED' || state === 'ARCHIVED') return 'neutral';
  if (state === 'SUSPENDED' || state === 'RECOUNT') return 'warning';
  return 'accent';
}

function VoteFlow() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>('identify');
  const [orgSlug, setOrgSlug] = useState('');
  const [elections, setElections] = useState<PublicElection[]>([]);
  const [electionId, setElectionId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [code, setCode] = useState('');
  const [devHint, setDevHint] = useState('');
  const [session, setSession] = useState('');
  const [ballot, setBallot] = useState<BallotData | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const org = params.get('org');
    const election = params.get('election');
    // Personal links from invitation emails/SMS carry the voter's member ID.
    const id = params.get('id');
    if (id) setMemberId(id.trim());
    if (org) {
      setOrgSlug(org);
      void findElections(org, election ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function act(fn: () => Promise<void>) {
    setError(null);
    setNotice('');
    setBusy(true);
    try { await fn(); } catch (err) { setError(friendlyFromUnknown(err)); }
    finally { setBusy(false); }
  }

  async function findElections(slug = orgSlug, electionParam?: string) {
    const clean = slug.trim();
    if (!clean) return;
    setSearched(true);
    const list = (await getJson(`/organizations/${encodeURIComponent(clean)}/elections`)) as PublicElection[];
    const arr = Array.isArray(list) ? list : [];
    setElections(arr);
    const preselect = electionParam && arr.find((el) => el.id === electionParam);
    if (preselect) setElectionId(preselect.id);
    else if (arr.length === 1) setElectionId(arr[0].id);
  }

  function choose(candidateId: string, position: BallotData['positions'][number], checked: boolean) {
    const current = selections[position.id] ?? [];
    const next = checked
      ? (position.maxChoices > 1 ? [...current, candidateId] : [candidateId])
      : current.filter((id) => id !== candidateId);
    setSelections({ ...selections, [position.id]: next });
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <main className="vote-shell">
      <div className="vote-aside">
      <div className="vote-head">
        <p className="eyebrow">Secure voting</p>
        <h1>Cast your ballot</h1>
        <p className="lede">
          Your selections are private. No record links you to how you voted, and your
          confirmation will not show your choices.
        </p>
      </div>

      <ol className="stepper" aria-label="Voting progress">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="dot">{i < stepIndex ? <Icon name="check" size={16} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      </div>
      <div className="vote-main">
      {error && (
        <Alert kind={error.severity === 'guidance' ? 'warning' : 'error'} title={error.title}>
          {error.message}
          {error.hint && <div className="alert-hint">{error.hint}</div>}
        </Alert>
      )}
      {notice && <Alert kind="success">{notice}</Alert>}

      {step === 'identify' && (
        <Card title="Find your election">
          <form onSubmit={(e) => { e.preventDefault(); void act(async () => { await findElections(); }); }}>
            <Field label="Organization code" htmlFor="org-slug" hint="The code your election officer gave you — it is not a secret.">
              <Input id="org-slug" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} required autoComplete="organization" placeholder="e.g. acme" />
            </Field>
            <Button type="submit" variant="secondary" block disabled={busy || !orgSlug.trim()}>
              {busy ? 'Searching…' : 'Find my election'}
            </Button>
          </form>

          {elections.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
              <legend className="field-label">Choose your election</legend>
              {elections.map((el) => (
                <label key={el.id} className="choice">
                  <input type="radio" name="election" checked={electionId === el.id} onChange={() => setElectionId(el.id)} />
                  <span className="choice-body">
                    <span className="choice-name">{el.name}</span>
                    <span className="choice-note" style={{ display: 'block' }}>
                      <Badge tone={statePill(el.state)}>{el.state === 'OPEN' ? 'Voting open' : el.state.toLowerCase()}</Badge>{' '}
                      {el.votingClosesAt ? `closes ${new Date(el.votingClosesAt).toLocaleString()}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {searched && elections.length === 0 && !busy && (
            <Alert kind="warning" title="No elections found">Check the organization code spelling or ask your election officer.</Alert>
          )}

          <hr className="divider" />
          <form onSubmit={(e) => { e.preventDefault(); if (!electionId) return; void act(async () => {
            const r = await call(`/elections/${electionId}/voting/otp/request`, { memberId: memberId.trim() });
            if (typeof r.devCode === 'string') setDevHint(`Local test code: ${r.devCode} (shown only outside production)`);
            setStep('code');
          }); }}>
            <Field label="Member ID" htmlFor="member-id" hint="Sent to you with your voting link by email or text message.">
              <Input id="member-id" value={memberId} onChange={(e) => setMemberId(e.target.value)} required autoComplete="username" />
            </Field>
            <Button type="submit" variant="primary" size="lg" block disabled={busy || !electionId}>
              {busy ? 'Sending…' : 'Send my code'}
            </Button>
          </form>
        </Card>
      )}

      {step === 'code' && (
        <Card title="Verify your identity">
          <p className="lede" style={{ marginBottom: 18 }}>
            Enter the 6-digit code sent to your registered email or phone. It expires in 10 minutes.
          </p>
          {devHint && <Alert kind="info">{devHint}</Alert>}
          <form onSubmit={(e) => { e.preventDefault(); void act(async () => {
            const r = await call(`/elections/${electionId}/voting/otp/verify`, { memberId: memberId.trim(), code: code.trim() });
            const s = String(r.ballotSession);
            setSession(s);
            const status = await getJson(`/elections/${electionId}/voting/status?ballotSession=${encodeURIComponent(s)}`) as { hasVoted?: boolean };
            if (status.hasVoted) {
              setError(toFriendly('ALREADY_VOTED: entitlement already consumed'));
              return;
            }
            const b = await call('/voting/ballot', { ballotSession: s });
            setBallot(b as unknown as BallotData);
            setStep('ballot');
          }); }}>
            <Field label="Verification code" htmlFor="otp-code">
              <Input id="otp-code" value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code"
                style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'var(--mono)' }} />
            </Field>
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setStep('identify')}>Back</Button>
              <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {busy ? 'Checking…' : 'Continue to ballot'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'ballot' && ballot && (
        <Card title={ballot.election.name}>
          <form onSubmit={(e) => { e.preventDefault(); setStep('review'); }}>
            {ballot.positions.map((pos) => (
              <fieldset key={pos.id} className="ballot-position">
                <legend className="field-label" style={{ fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>
                  {pos.title}
                  {pos.maxChoices > 1 && <span className="field-hint" style={{ display: 'inline', marginLeft: 8 }}>choose up to {pos.maxChoices}</span>}
                </legend>
                {pos.candidates.map((cand) => (
                  <label key={cand.id} className="choice">
                    <input type={pos.maxChoices > 1 ? 'checkbox' : 'radio'} name={pos.id}
                      checked={(selections[pos.id] ?? []).includes(cand.id)}
                      onChange={(e) => choose(cand.id, pos, e.target.checked)} />
                    <span className="choice-body">
                      <span className="choice-name">{cand.fullName}</span>
                      {cand.statement ? <span className="choice-note" style={{ display: 'block' }}>{cand.statement}</span> : null}
                    </span>
                  </label>
                ))}
                {pos.allowAbstain && <p className="small muted" style={{ margin: '4px 0 0' }}>Leave blank to abstain for this position.</p>}
              </fieldset>
            ))}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setStep('code')}>Back</Button>
              <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {busy ? 'Loading…' : 'Review ballot'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'review' && ballot && (
        <Card title="Review before you submit">
          <Alert kind="warning" title="This cannot be undone">Check carefully — after submitting, your ballot cannot be changed.</Alert>
          {ballot.positions.map((pos) => {
            const chosen = (selections[pos.id] ?? [])
              .map((id) => pos.candidates.find((c) => c.id === id)?.fullName)
              .filter(Boolean);
            return (
              <div key={pos.id} className="result-row">
                <div><strong>{pos.title}</strong><div className="small muted">{chosen.length ? chosen.join(', ') : 'Abstain'}</div></div>
                <Button variant="ghost" size="sm" onClick={() => setStep('ballot')}>Edit</Button>
              </div>
            );
          })}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setStep('ballot')}>Go back</Button>
            <Button variant="primary" size="lg" block disabled={busy} onClick={() => void act(async () => {
              const r = await call('/voting/submit', {
                ballotSession: session, selections,
                idempotencyKey: `${electionId}-${memberId.trim()}-submit`,
              });
              setReceipt(String(r.receiptId));
              setStep('done');
            })}>{busy ? 'Submitting…' : 'Submit ballot'}</Button>
          </div>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <div style={{ textAlign: 'center' }}>
            <div className="success-mark"><Icon name="check" size={30} /></div>
            <h2 style={{ fontSize: 22 }}>Your ballot was recorded</h2>
            <p className="muted" style={{ lineHeight: 1.6 }}>Thank you for voting. Your confirmation reference:</p>
          </div>
          <div className="receipt">
            <code>{receipt}</code>
            <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(receipt)}>Copy</Button>
          </div>
          <p className="muted small" style={{ lineHeight: 1.6 }}>
            This reference confirms acceptance only. It does not show your selections,
            and no one can use it to see how you voted. Save it if you want proof
            your vote was counted.
          </p>
          <Button variant="secondary" block onClick={() => window.location.href = '/'}>Return home</Button>
        </Card>
      )}
      </div>
    </main>
  );
}

export default function VotePage() {
  return (
    <Suspense fallback={<main className="page"><Skeleton lines={6} /></main>}>
      <VoteFlow />
    </Suspense>
  );
}
