'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '../../components/ui';
import { StaffSignInForm } from '../../components/staff-sign-in';
import { AuthLayout } from '../../components/saas';
import { clearSession, fetchPrincipal, isPlatformOnly, storeSession, type SessionData } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) {
      setChecking(false);
      return;
    }
    // Already signed in with a live session - go straight to the right portal.
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

  function done(data: SessionData) {
    storeSession(data);
    // Platform-only accounts belong to the control-plane portal.
    const platformOnly = (data.assignments ?? []).length > 0 &&
      (data.assignments ?? []).every((a) => a.role === 'platform_admin');
    router.replace(platformOnly ? '/platform' : '/admin');
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
    <AuthLayout
      eyebrow="Election administration"
      title="Welcome back"
      lede="Sign in to the election console for your organization."
      footer={<>Don&apos;t have an account? Organizations and staff accounts are provisioned through the <Link href="/platform">platform administration portal</Link>. Platform administrators sign in there directly.</>}
    >
      <StaffSignInForm onSignedIn={done} notice={status} />
    </AuthLayout>
  );
}
