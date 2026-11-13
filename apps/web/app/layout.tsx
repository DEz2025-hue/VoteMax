import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import SwRegister from './sw-register';
import SiteNav from '../components/site-nav';

export const metadata = {
  title: 'VoteMax by ClaMax Group',
  description: 'Secure organizational elections — register, vote privately, verify results.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container site-header-inner">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">V</span>VoteMax</Link>
            <SiteNav />
          </div>
        </header>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
