'use client';

/**
 * Last-resort boundary: renders when the root layout itself fails, so it must
 * supply its own <html>/<body> and cannot rely on the app's stylesheet.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#f8fafc', color: '#172033' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontSize: 26, margin: '0 0 12px', color: '#0f2547' }}>We&apos;ll be right back</h1>
            <p style={{ lineHeight: 1.6, color: '#475569', margin: '0 0 22px' }}>
              Something went wrong on our side. Nothing you entered has been lost or changed.
              Please try again in a moment.
            </p>
            <button
              type="button" onClick={reset}
              style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 650, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
