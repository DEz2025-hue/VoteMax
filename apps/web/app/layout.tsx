import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import './glass.css';
import SwRegister from './sw-register';
import SiteNav from '../components/site-nav';

export const metadata = {
  title: 'PGA by ClaMax Group',
  description: 'Secure organizational elections - register, vote privately, verify results.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container site-header-inner">
            <Link href="/" className="brand" aria-label="PGA home"><img src="/logo.png" alt="PGA" className="brand-logo" width={46} height={36} /></Link>
            <SiteNav />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container site-footer-inner">
            <span>© {new Date().getFullYear()} PGA by ClaMax Group</span>
            <nav aria-label="Footer">
              <Link href="/vote">Vote</Link>
              <Link href="/help">How to vote</Link>
              <Link href="/login">Sign in</Link>
            </nav>
          </div>
        </footer>
        <SwRegister />
      </body>
    </html>
  );
}
