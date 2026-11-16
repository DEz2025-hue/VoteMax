'use client';

import { fraudHeaders } from './fraud';
import { apiRequest } from './http';
import { AppError, toFriendly } from './errors';
import type { AssignmentInfo } from './capabilities';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SessionData {
  token: string;
  userId: string;
  organizationId: string | null;
  assignments?: AssignmentInfo[];
}

const SESSION_KEYS = [
  'votemax.session',
  'votemax.user',
  'votemax.org',
  'votemax.orgSlug',
  'votemax.election',
  'votemax.assignments',
] as const;

/** POST /auth/login - returns the session payload or throws with the API message. */
export async function signIn(email: string, password: string, totp?: string): Promise<SessionData> {
  const data = await apiRequest(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await fraudHeaders()) },
    body: JSON.stringify({ email, password, totp: totp || undefined }),
  }) as Partial<SessionData>;
  if (!data.token) throw new AppError(toFriendly('AUTH_FAILED: invalid email or password', 401), 401);
  return data as SessionData;
}

/** Persist the session exactly as the console pages expect it. */
export function storeSession(data: SessionData): void {
  sessionStorage.setItem('votemax.session', data.token);
  if (data.userId) sessionStorage.setItem('votemax.user', data.userId);
  if (data.organizationId) sessionStorage.setItem('votemax.org', data.organizationId);
  if (Array.isArray(data.assignments)) {
    sessionStorage.setItem('votemax.assignments', JSON.stringify(data.assignments));
  }
}

export function clearSession(): void {
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
}

/** Revoke the bearer session server-side, then clear local session state. */
/** Fired on window the moment a sign-out happens, so every open screen can react at once. */
export const SIGNOUT_EVENT = 'votemax:signout';

export async function signOut(): Promise<void> {
  const token = sessionStorage.getItem('votemax.session');
  // End the local session FIRST and tell every screen. Waiting for the server before doing so left
  // the old session in place while the page moved to /login, which then sent the user straight
  // back in until a refresh. The token is revoked on the server right after.
  clearSession();
  window.dispatchEvent(new Event(SIGNOUT_EVENT));
  if (token) {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        keepalive: true,
        headers: { authorization: `Bearer ${token}`, ...(await fraudHeaders()) },
      });
    } catch { /* best effort - the local session is already gone */ }
  }
}

export interface Principal {
  userId: string;
  email?: string;
  displayName?: string;
  organizationId: string | null;
  assignments: (AssignmentInfo & { userId?: string })[];
}

/** Resolve a bearer token to its principal, or null when invalid/expired. */
export async function fetchPrincipal(token: string): Promise<Principal | null> {
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as Principal;
  } catch {
    return null;
  }
}

/** True when the bearer token still resolves to a principal. */
export async function sessionIsValid(token: string): Promise<boolean> {
  return (await fetchPrincipal(token)) !== null;
}

/**
 * Platform-only accounts (every assignment is platform_admin, no tenant
 * roles) belong to the control-plane portal, not the organization console.
 */
export function isPlatformOnly(principal: Principal): boolean {
  return principal.assignments.length > 0 &&
    principal.assignments.every((a) => a.role === 'platform_admin');
}
