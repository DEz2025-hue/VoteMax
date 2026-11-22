'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from './icons';

/* Shared SaaS building blocks used by the platform console, the admin
   console and the auth screens. Styles live in globals.css (.ps-*, .auth-*). */

/** A summary figure. `icon` and `tone` are accepted for older call sites but no longer drawn. */
export function Kpi({ label, value, note }: {
  icon?: string; label: string; value: ReactNode; note?: string;
  tone?: 'blue' | 'navy' | 'amber' | 'green';
}) {
  return (
    <div className="ps-kpi">
      <div>
        <div className="ps-kpi-label">{label}</div>
        <div className="ps-kpi-value">{value}</div>
        {note && <div className="ps-kpi-note">{note}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, flush }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean;
}) {
  return (
    <section className="ps-panel">
      {(title || actions) && (
        <header className="ps-panel-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          {actions && <div className="ps-panel-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'ps-panel-flush' : 'ps-panel-body'}>{children}</div>
    </section>
  );
}

export function StatusRow({ label, value, tone }: { label: string; value: ReactNode; tone: 'ok' | 'warn' | 'bad' | 'off' }) {
  return (
    <div className="ps-status-row">
      <span className="ps-status-label"><i className={`ps-dot ${tone}`} />{label}</span>
      <span className="ps-status-value">{value}</span>
    </div>
  );
}

export interface NavItem { id: string; label: string; icon: string; badge?: ReactNode }

/** Sidebar + top bar console frame. Content goes in `children`; overlays
 *  (drawers, dialogs, toasts) go in `after` so they sit inside <main>. */
export function ConsoleShell({
  subtitle, navLabel, nav, active, onSelect, footer, title, description, actions, children, after,
}: {
  subtitle: string; navLabel: string; nav: NavItem[]; active: string; onSelect: (id: string) => void;
  footer?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode;
  children: ReactNode; after?: ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  return (
    <div className="ps-shell">
      <aside className={`ps-sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="ps-side-head">
          <span className="ps-logo"><img src="/logo.png" alt="PGA" width={40} height={31} /></span>
          <div><strong>PGA</strong><span>{subtitle}</span></div>
        </div>
        <div className="ps-nav-label">{navLabel}</div>
        <nav className="ps-nav" aria-label={navLabel}>
          {nav.map((s) => (
            <button
              key={s.id} type="button"
              className={active === s.id ? 'active' : ''}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => { onSelect(s.id); setMobileNav(false); }}
            >
              <span>{s.label}</span>
              {s.badge !== undefined && s.badge !== null && <em>{s.badge}</em>}
            </button>
          ))}
        </nav>
        {footer && <div className="ps-side-foot">{footer}</div>}
      </aside>
      {mobileNav && <div className="drawer-backdrop" onClick={() => setMobileNav(false)} />}

      <main className="ps-main">
        <header className="ps-topbar">
          <button type="button" className="ps-icon-btn ps-menu-btn" aria-label="Open navigation" onClick={() => setMobileNav((v) => !v)}><Icon name="menu" /></button>
          <div className="ps-topbar-title">
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="ps-topbar-actions">{actions}</div>}
        </header>
        <div className="ps-content">{children}</div>
        {after}
      </main>
    </div>
  );
}

/** Split-screen auth layout: brand panel on the left, form on the right. */
export function AuthLayout({ eyebrow, title, lede, children, footer }: {
  eyebrow: string; title: string; lede?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <span className="ps-logo ps-logo-lg"><img src="/logo.png" alt="PGA" width={64} height={50} /></span>
          <h2>Elections your members can trust.</h2>
          <ul>
            <li><span>Secret ballots - no record links a voter to a vote.</span></li>
            <li><span>Tamper-evident audit trail for every action.</span></li>
            <li><span>Separation of duties for tally and certification.</span></li>
          </ul>
        </div>
      </aside>
      <section className="auth-pane">
        <div className="auth-form">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
