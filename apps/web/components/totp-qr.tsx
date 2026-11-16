'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** otpauth:// URI that authenticator apps understand. */
export function totpUri(email: string, secret: string): string {
  return `otpauth://totp/VoteMax:${encodeURIComponent(email)}?secret=${secret}&issuer=VoteMax`;
}

/**
 * QR code for authenticator setup. Rendered entirely in the browser, so the
 * secret never leaves the page.
 */
export function TotpQr({ email, secret, size = 184 }: { email: string; secret: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(totpUri(email, secret), { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(''); });
    return () => { live = false; };
  }, [email, secret, size]);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt={`Authenticator QR code for ${email}`}
      style={{ display: 'block', background: '#fff', padding: 6, borderRadius: 8, border: '1px solid var(--border, #d9e0ec)' }} />
  );
}
