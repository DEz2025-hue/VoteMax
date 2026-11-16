'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input } from './ui';
import { requestLoginCode, verifyLoginCode, type SessionData } from '../lib/auth';
import { friendlyFromUnknown, type FriendlyError } from '../lib/errors';

/**
 * Staff sign-in in two steps: email + password, then the 6-digit code we email to
 * the account. Used by both the organization login and the platform console.
 */
export function StaffSignInForm({ onSignedIn, notice, idPrefix = 'login' }: {
  onSignedIn: (data: SessionData) => void;
  notice?: string;
  idPrefix?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [info, setInfo] = useState('');

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try { await fn(); } catch (err) { setError(friendlyFromUnknown(err)); } finally { setBusy(false); }
  }

  async function sendCode(resend = false) {
    await run(async () => {
      const r = await requestLoginCode(email.trim(), password);
      setSent(true);
      setCode('');
      setDevCode(r.devCode ?? '');
      setInfo(resend ? 'If your last code has not arrived, check your spam folder. A new one is sent once a minute has passed.' : '');
    });
  }

  async function confirm() {
    await run(async () => {
      onSignedIn(await verifyLoginCode(email.trim(), code.trim()));
    });
  }

  return (
    <>
      {notice && !error && <Alert kind="info">{notice}</Alert>}
      {error && (
        <Alert kind={error.severity === 'guidance' ? 'warning' : 'error'} title={error.title}>
          {error.message}
          {error.hint && <div className="alert-hint">{error.hint}</div>}
        </Alert>
      )}
      {!sent ? (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <Field label="Email" htmlFor={`${idPrefix}-email`}><Input id={`${idPrefix}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
          <Field label="Password" htmlFor={`${idPrefix}-password`}><Input id={`${idPrefix}-password`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy || !email || !password}>{busy ? 'Checking…' : 'Continue'}</Button>
        </form>
      ) : (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
          <p className="muted" style={{ marginTop: 0 }}>We emailed a 6-digit code to <strong>{email.trim()}</strong>. It expires in 10 minutes.</p>
          {devCode && <Alert kind="info">Test mode - your code is {devCode}</Alert>}
          {info && <p className="muted small">{info}</p>}
          <Field label="Sign-in code" htmlFor={`${idPrefix}-code`}><Input id={`${idPrefix}-code`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus /></Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy || code.trim().length < 6}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <div className="form-actions">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); setInfo(''); }}>Use a different account</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void sendCode(true)}>Send a new code</Button>
          </div>
        </form>
      )}
    </>
  );
}
