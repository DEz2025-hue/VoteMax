'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fetchPrincipal, isPlatformOnly, signOut, type Principal } from '../lib/auth';

const links = [
  { href: '/', label: 'Home' },
  { href: '/vote', label: 'Vote' },
  { href: '/help', label: 'How to vote' },
  { href: '/login', label: 'Sign in' },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Resolve the stored session once per navigation so sign-in/out is reflected.
  useEffect(() => {
    const t = sessionStorage.getItem('votemax.session');
    if (!t) {
      setPrincipal(null);
      setChecked(true);
      return;
    }
    let alive = true;
    void fetchPrincipal(t).then((p) => {
      if (!alive) return;
      setPrincipal(p);
      setChecked(true);
    });
    return () => { alive = false; };
  }, [pathname]);

  // Close the account menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const platformOnly = principal ? isPlatformOnly(principal) : false;
  const portal = platformOnly ? '/platform' : '/admin';
  const portalLabel = platformOnly ? 'Platform console' : 'Dashboard';
  const displayName = principal?.displayName || principal?.email || 'Account';
  const email = principal?.email ?? '';

  function doSignOut() {
    setMenuOpen(false);
    void signOut().then(() => setPrincipal(null));
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
      <nav id="site-nav" className={`site-nav ${open ? 'open' : ''}`} aria-label="Primary">
        {links
          .filter((l) => !(l.href === '/login' && principal))
          .map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${pathname === l.href ? 'active' : ''}`} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        {checked && principal ? (
          <div className="user-menu" ref={menuRef}>
            <button type="button" className="user-chip" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar" aria-hidden="true">{initials(displayName)}</span>
              <span className="user-name">{displayName}</span>
            </button>
            {menuOpen && (
              <div className="user-dropdown" role="menu">
                <div className="user-dropdown-head">
                  <strong>{displayName}</strong>
                  {email && <span className="muted small">{email}</span>}
                </div>
                <Link href={portal} role="menuitem" onClick={() => { setMenuOpen(false); setOpen(false); }}>{portalLabel}</Link>
                <button type="button" role="menuitem" onClick={doSignOut}>Sign out</button>
              </div>
            )}
          </div>
        ) : null}
      </nav>
    </>
  );
}
