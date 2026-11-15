'use client';

import { friendlyFromUnknown } from '../lib/errors';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Button({ variant = 'primary', size = 'md', block, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button className={`btn btn-${variant}${size === 'lg' ? ' btn-lg' : size === 'sm' ? ' btn-sm' : ''}${block ? ' btn-block' : ''} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || actions) && <div className="card-header"><div><h2>{title}</h2></div>{actions && <div className="card-actions">{actions}</div>}</div>}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'error' | 'accent' | 'navy' | 'neutral'; children: ReactNode }) {
  const map = { success: 'pill-open', warning: 'pill-warning', error: 'pill-error', accent: 'pill-accent', navy: 'pill-navy', neutral: 'pill-neutral' } as const;
  return <span className={`pill ${map[tone]}`}>{children}</span>;
}

export function Alert({ kind = 'info', title, children, role }: { kind?: 'info' | 'success' | 'warning' | 'error'; title?: string; children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div role={role ?? (kind === 'error' ? 'alert' : 'status')} className={`alert alert-${kind}`}>
      {title && <div className="alert-title">{title}</div>}
      {children}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p className="muted small" style={{ margin: 0 }}>{children}</p>}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div aria-hidden="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ height: 18, marginBottom: 10, width: `${100 - i * 8}%` }} />)}</div>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{note && <div className="stat-note">{note}</div>}</div>;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" ref={ref}>
        <h2 id="confirm-title">{title}</h2>
        <div>{message}</div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export interface ToastData { message: string; kind: 'info' | 'error' | 'warning'; title?: string; hint?: string; technical?: string }

/** Build a toast from anything thrown - friendly text, never raw codes. */
export function errorToast(err: unknown, title?: string): ToastData {
  const f = friendlyFromUnknown(err);
  return {
    kind: f.severity === 'guidance' ? 'warning' : 'error',
    title: title ?? f.title, message: f.message, hint: f.hint, technical: f.technical,
  };
}

export function Toast({ message, kind = 'info', title, hint, technical, onClose }: { message: string | null; kind?: 'info' | 'error' | 'warning'; title?: string; hint?: string; technical?: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    // Longer messages need longer to read; guidance with a hint stays up a bit more.
    const t = setTimeout(onClose, kind === 'info' ? 4500 : hint ? 12000 : 8000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [message, kind, hint, onClose]);
  if (!message) return null;
  const isError = kind === 'error';
  const isWarning = kind === 'warning';
  return (
    <div className="toast-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`toast-card ${isError ? 'error' : isWarning ? 'warning' : 'success'}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
        <span className="toast-icon" aria-hidden="true">{isError ? '!' : isWarning ? 'i' : '✓'}</span>
        <div className="toast-body">
          {title && <strong className="toast-title">{title}</strong>}
          <div>{message}</div>
          {hint && <div className="toast-hint">{hint}</div>}
          {technical && (
            <details className="toast-tech">
              <summary>Details for support</summary>
              <code>{technical}</code>
            </details>
          )}
        </div>
        <button type="button" className="chip-remove toast-close" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
