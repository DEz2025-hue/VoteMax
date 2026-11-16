'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Skeleton } from '../../components/ui';
import { fraudHeaders } from '../../lib/fraud';
import { apiRequest } from '../../lib/http';
import { AppError, friendlyFromUnknown, networkError, toFriendly, type FriendlyError } from '../../lib/errors';
import { Icon } from '../../components/icons';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface BallotData {
  election: { id: string; name: string };
  positions: {
    id: string; title: string; maxChoices: number; allowAbstain: boolean;
    candidates: { id: string; fullName: string; statement: string | null; photoUrl: string | null }[];
  }[];
}

async function call(path: string, body: unknown): Promise<Record<string, unknown>> {
  return apiRequest(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await fraudHeaders()) },
    body: JSON.stringify(body),
  });
}

async function getJson(path: string): Promise<unknown> {
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

/**
 * Voters sign in with the personal link from their invitation (member ID + secret
 * key in the address). There is no code to fetch from an email, so a phone user
 * never has to leave the page to vote.
 */
type Step = 'enter' | 'ballot' | 'review' | 'done';
const STEP_ORDER: Step[] = ['enter', 'ballot', 'review', 'done'];
const STEP_LABELS = ['Sign in', 'Ballot', 'Review', 'Done'];

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

/** Round candidate photo, or their initials when there is no photo (or it fails to load). */
function CandidatePhoto({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img className="cand-photo" src={`${API}${url}`} alt={`Photo of ${name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <span className="cand-photo cand-photo-empty" aria-hidden="true">{initialsOf(name)}</span>;
}

function VoteFlow() {
  const params = useSearchParams();
  const electionId = params.get('election') ?? '';
  const memberId = (params.get('id') ?? '').trim();
  const key = (params.get('key') ?? '').trim();
  const hasLink = Boolean(electionId && memberId && key);

  const [step, setStep] = useState<Step>('enter');
  const [session, setSession] = useState('');
  const [ballot, setBallot] = useState<BallotData | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function act(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try { await fn(); } catch (err) { setError(friendlyFromUnknown(err)); }
    finally { setBusy(false); }
  }

  /** Sign in with the personal link, then load the ballot. */
  async function enter() {
    await act(async () => {
      const r = await call(`/elections/${encodeURIComponent(electionId)}/voting/link/enter`, { memberId, key });
      const s = String(r.ballotSession);
      setSession(s);
      const status = await getJson(`/elections/${encodeURIComponent(electionId)}/voting/status?ballotSession=${encodeURIComponent(s)}`) as { hasVoted?: boolean };
      if (status.hasVoted) {
        setError(toFriendly('ALREADY_VOTED: entitlement already consumed'));
        return;
      }
      const b = await call('/voting/ballot', { ballotSession: s });
      setBallot(b as unknown as BallotData);
      setStep('ballot');
    });
  }

  useEffect(() => {
    // Opening the link signs the voter in. The ref stops a double run in development.
    if (!hasLink || started.current) return;
    started.current = true;
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLink]);

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

      {step === 'enter' && !hasLink && (
        <Card title="Open your personal voting link">
          <p className="lede" style={{ marginBottom: 12 }}>
            To vote, open the personal link in the invitation we sent you by email or text message.
            It signs you in - there is no code to enter.
          </p>
          <p className="muted small" style={{ lineHeight: 1.6 }}>
            Can&apos;t find it? Look for a message with your member ID and a &quot;Vote here&quot; link,
            or ask your election officer to send it again.
          </p>
        </Card>
      )}

      {step === 'enter' && hasLink && (
        <Card title="Signing you in">
          {busy && <Skeleton lines={3} />}
          {!busy && error && (
            <Button variant="secondary" block onClick={() => void enter()}>Try again</Button>
          )}
        </Card>
      )}

      {step === 'ballot' && ballot && (
        <Card title={ballot.election.name}>
          <Alert kind="info">
            Your voting link is personal. Keep it secret and do not share it - anyone with it can vote as you.
          </Alert>
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
                    <CandidatePhoto name={cand.fullName} url={cand.photoUrl} />
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
              <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {busy ? 'Loading…' : 'Review ballot'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'review' && ballot && (
        <Card title="Review before you submit">
          <Alert kind="warning" title="This cannot be undone">Check carefully - after submitting, your ballot cannot be changed.</Alert>
          {ballot.positions.map((pos) => {
            const chosen = (selections[pos.id] ?? [])
              .map((id) => pos.candidates.find((c) => c.id === id))
              .filter((c): c is BallotData['positions'][number]['candidates'][number] => Boolean(c));
            return (
              <div key={pos.id} className="result-row">
                <div>
                  <strong>{pos.title}</strong>
                  <div className="review-picks">
                    {chosen.length
                      ? chosen.map((c) => <span key={c.id} className="review-pick"><CandidatePhoto name={c.fullName} url={c.photoUrl} />{c.fullName}</span>)
                      : <span className="small muted">Abstain</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('ballot')}>Edit</Button>
              </div>
            );
          })}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setStep('ballot')}>Go back</Button>
            <Button variant="primary" size="lg" block disabled={busy} onClick={() => void act(async () => {
              const r = await call('/voting/submit', {
                ballotSession: session, selections,
                idempotencyKey: `${electionId}-${memberId}-submit`,
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
