/**
 * Transactional email over HTTPS (Brevo, Resend or SendGrid).
 *
 * Unlike SMTP this uses ordinary web requests, so it works from hosts that
 * block outbound mail ports (e.g. Railway's Hobby plan) and these providers
 * handle deliverability and high volume far better than a personal mailbox.
 *
 * Environment:
 *   EMAIL_PROVIDER = brevo | resend | sendgrid
 *   EMAIL_API_KEY  = the provider's API key
 *   EMAIL_FROM     = "PGA <elections@your-domain>" (must be a sender/domain
 *                    verified with the provider; falls back to SMTP_FROM)
 *
 * When configured it is preferred over SMTP; SMTP remains the fallback.
 */

export type EmailProvider = 'brevo' | 'resend' | 'sendgrid';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/** Split `Name <addr@host>` (or a bare address) into parts. */
export function parseFromAddress(from: string): { name?: string; email: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1]?.trim() || undefined, email: m[2].trim() };
  return { email: from.trim() };
}

export class HttpEmailSender {
  readonly provider: EmailProvider | null;
  readonly configured: boolean;
  private readonly apiKey: string;
  private readonly from: { name?: string; email: string };

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const p = (env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
    this.provider = p === 'brevo' || p === 'resend' || p === 'sendgrid' ? p : null;
    this.apiKey = (env.EMAIL_API_KEY ?? '').trim();
    this.from = parseFromAddress(env.EMAIL_FROM ?? env.SMTP_FROM ?? '');
    this.configured = Boolean(this.provider && this.apiKey && this.from.email);
  }

  async send(msg: EmailPayload): Promise<void> {
    if (!this.provider || !this.configured) throw new Error('Email API is not configured');
    const { url, headers, body } = this.request(msg);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Provider error text explains things like "sender not verified". It never contains our key.
      const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      throw new Error(`${this.provider} email API ${res.status}${detail ? `: ${detail}` : ''}`);
    }
  }

  private request(msg: EmailPayload): { url: string; headers: Record<string, string>; body: unknown } {
    const { name, email } = this.from;
    switch (this.provider) {
      case 'brevo':
        return {
          url: 'https://api.brevo.com/v3/smtp/email',
          headers: { 'api-key': this.apiKey },
          body: {
            sender: name ? { name, email } : { email },
            to: [{ email: msg.to }],
            subject: msg.subject,
            textContent: msg.text,
          },
        };
      case 'resend':
        return {
          url: 'https://api.resend.com/emails',
          headers: { authorization: `Bearer ${this.apiKey}` },
          body: { from: name ? `${name} <${email}>` : email, to: [msg.to], subject: msg.subject, text: msg.text },
        };
      case 'sendgrid':
        return {
          url: 'https://api.sendgrid.com/v3/mail/send',
          headers: { authorization: `Bearer ${this.apiKey}` },
          body: {
            personalizations: [{ to: [{ email: msg.to }] }],
            from: name ? { email, name } : { email },
            subject: msg.subject,
            content: [{ type: 'text/plain', value: msg.text }],
          },
        };
      default:
        throw new Error('Email API is not configured');
    }
  }
}
