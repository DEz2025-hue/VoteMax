import { AppError, networkError, toFriendly } from './errors';

/**
 * One place that talks to the API and turns every failure — HTTP errors,
 * server crashes, dropped connections — into an AppError carrying a friendly
 * message. Pages catch it and show `err.friendly`; they never see raw codes.
 */
export async function apiRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new AppError(networkError(err instanceof Error ? err.message : undefined));
  }
  const text = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { /* non-JSON body (proxy error page) */ }
  if (!res.ok) {
    const m = data.message;
    const raw = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : `HTTP ${res.status}`;
    throw new AppError(toFriendly(raw, res.status), res.status);
  }
  return data;
}
