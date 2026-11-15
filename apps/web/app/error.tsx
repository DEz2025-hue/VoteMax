'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '../components/icons';

/** Catches unexpected rendering errors in any page and shows a calm recovery screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the technical detail for support/logs — never in the headline.
    console.error('[votemax] page error', error);
  }, [error]);

  return (
    <main className="status-page">
      <div className="status-card">
        <span className="status-icon warn"><Icon name="alert" size={26} /></span>
        <h1>Something didn&apos;t load properly</h1>
        <p className="lede">
          That&apos;s on our side, not yours. Nothing you entered has been lost or changed,
          and your vote and your account are safe.
        </p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-secondary">Go to the home page</Link>
        </div>
        {error.digest && <p className="small muted" style={{ marginTop: 18 }}>If it keeps happening, tell support this reference: <code>{error.digest}</code></p>}
      </div>
    </main>
  );
}
