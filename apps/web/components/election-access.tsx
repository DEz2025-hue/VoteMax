'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input } from './ui';

export default function ElectionAccess() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  return (
    <div className="access-card">
      <p className="eyebrow">Election access</p>
      <h2>Find your election</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Enter the organization or election code provided by your election officer.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); router.push(`/vote?org=${encodeURIComponent(slug.trim())}`); }}>
        <Field label="Organization code" htmlFor="org-code">
          <Input id="org-code" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. acme" autoComplete="organization" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={!slug.trim()}>Continue to voter verification</Button>
      </form>
      <p className="small muted" style={{ margin: '14px 0 0' }}>
        Need help? <a href="/help">Read the voting guide</a> or contact your election officer.
      </p>
    </div>
  );
}
