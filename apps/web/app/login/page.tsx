'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input, Skeleton } from '../../components/ui';
import { clearSession, fetchPrincipal, isPlatformOnly, signIn, storeSession } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');

  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) {
      setChecking(false);
      return;
    }
    // Already signed in with a live session — go straight to the right portal.
    void fetchPrincipal(t).then((principal) => {
      if (principal) {
        router.replace(isPlatformOnly(principal) ? '/platform' : '/admin');
        return;
      }
      clearSession();
      setStatus('Your session has expired. Please sign in again.');
      setChecking(false);
    });
  }, [router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setStatus('Signing in…');
    setStatusKind('info');
    try {
      const data = await signIn(
        String(f.get('email') ?? ''),
        String(f.get('password') ?? ''),
        String(f.get('totp') ?? ''),
      );
      storeSession(data);
      // Platform-only accounts belong to the control-plane portal.
      const platformOnly = (data.assignments ?? []).length > 0 &&
        (data.assignments ?? []).every((a) => a.role === 'platform_admin');
      router.replace(platformOnly ? '/platform' : '/admin');
    } catch (err) {
      setStatus(`Sign in: ${err instanceof Error ? err.message : 'failed'}`);
      setStatusKind('error');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Skeleton lines={5} />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Election administration</p>
        <h1>Sign in</h1>
        <p className="lede">Access the election console for your organization.</p>
        {status && <Alert kind={statusKind === 'error' ? 'error' : 'info'}>{status}</Alert>}
        <Card title="Organization sign in">
          <form onSubmit={submit} className="inline-form">
            <Field label="Email" htmlFor="login-email"><Input id="login-email" name="email" type="email" required autoComplete="username" /></Field>
            <Field label="Password" htmlFor="login-password"><Input id="login-password" name="password" type="password" required autoComplete="current-password" /></Field>
            <Field label="TOTP code" hint="Required for privileged accounts" htmlFor="login-totp"><Input id="login-totp" name="totp" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" /></Field>
            <Button type="submit" variant="primary" block disabled={loading}>Sign in</Button>
          </form>
        </Card>
        <p className="small muted" style={{ margin: '16px 2px 0', textAlign: 'center' }}>
          Don't have an account? Organizations and staff accounts are provisioned through the <Link href="/platform">platform administration portal</Link>.
          Platform administrators sign in there directly.
        </p>
      </div>
    </main>
  );
}
