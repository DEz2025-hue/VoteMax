'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Home' },
  { href: '/vote', label: 'Vote' },
  { href: '/help', label: 'How to vote' },
  { href: '/login', label: 'Sign in' },
  { href: '/admin', label: 'Administration' },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
      <nav id="site-nav" className={`site-nav ${open ? 'open' : ''}`} aria-label="Primary">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link ${pathname === l.href ? 'active' : ''}`} onClick={() => setOpen(false)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
