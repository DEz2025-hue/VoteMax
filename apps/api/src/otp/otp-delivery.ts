import nodemailer from 'nodemailer';
import { logEvent } from '../common/logger';

/**
 * OTP delivery (DEC-004 §3, finding F-04). Codes are sent through
 * env-configured providers — never returned to the caller outside the
 * explicit dev outbox. Message content carries only the code and expiry
 * (FR-SUP-002); no election content beyond that.
 */

export interface OtpMessage {
  electionId: string;
  memberId: string;
  code: string;
  email?: string;
  phone?: string;
}

export type DeliveryChannel = 'email' | 'sms' | 'dev';

export interface OtpSender {
  readonly channel: 'email' | 'sms';
  /** True when provider credentials are configured (independent of recipient). */
  readonly configured: boolean;
  /** Returns true when this sender can reach the given message target. */
  canDeliver(msg: OtpMessage): boolean;
  send(msg: OtpMessage): Promise<void>;
}

function otpText(msg: OtpMessage): string {
  return `Your Votemax verification code is ${msg.code}. It expires in 10 minutes. Do not share it with anyone.`;
}

/** SMTP email sender (nodemailer). Configured via SMTP_* env vars. */
export class SmtpOtpSender implements OtpSender {
  readonly channel = 'email' as const;
  readonly configured: boolean;
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.from = env.SMTP_FROM ?? env.SMTP_USER ?? '';
    this.configured = Boolean(env.SMTP_HOST);
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        // Fail fast so a voter isn't left waiting while the server is unreachable.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
  }

  canDeliver(msg: OtpMessage): boolean {
    return this.transporter !== null && Boolean(msg.email);
  }

  async send(msg: OtpMessage): Promise<void> {
    if (!this.transporter || !msg.email) throw new Error('SMTP sender not configured or no recipient');
    await this.transporter.sendMail({
      from: this.from,
      to: msg.email,
      subject: 'Your Votemax verification code',
      text: otpText(msg),
    });
  }
}

/** Africa's Talking SMS sender. Configured via AT_* env vars (DEC-004 §3). */
export class AfricaTalkingSmsSender implements OtpSender {
  readonly channel = 'sms' as const;
  readonly configured: boolean;
  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.AT_API_KEY ?? '';
    this.username = env.AT_USERNAME ?? '';
    this.senderId = env.AT_SENDER_ID ?? '';
    this.configured = Boolean(this.apiKey && this.username);
  }

  canDeliver(msg: OtpMessage): boolean {
    return Boolean(this.apiKey && this.username) && Boolean(msg.phone);
  }

  async send(msg: OtpMessage): Promise<void> {
    if (!msg.phone) throw new Error('No phone number for SMS delivery');
    await this.sendText(msg.phone, otpText(msg));
  }

  /** Send any short text (one-time codes, voter invitations). */
  async sendText(to: string, text: string): Promise<void> {
    const body = new URLSearchParams({
      username: this.username,
      to,
      message: text,
    });
    if (this.senderId) body.set('from', this.senderId);
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (!res.ok) throw new Error(`Africa's Talking SMS failed: HTTP ${res.status}`);
    const data = (await res.json()) as { SMSMessageData?: { Recipients?: { status?: string }[] } };
    const status = data.SMSMessageData?.Recipients?.[0]?.status;
    if (status && status.toLowerCase() !== 'success') {
      throw new Error(`Africa's Talking SMS rejected: ${status}`);
    }
  }
}

/** Generic HTTPS webhook SMS sender (any provider that accepts JSON POST). */
export class WebhookSmsSender implements OtpSender {
  readonly channel = 'sms' as const;
  readonly configured: boolean;
  private readonly url: string;
  private readonly authHeader: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.url = env.SMS_WEBHOOK_URL ?? '';
    this.authHeader = env.SMS_WEBHOOK_AUTH;
    this.configured = Boolean(this.url);
  }

  canDeliver(msg: OtpMessage): boolean {
    return Boolean(this.url) && Boolean(msg.phone);
  }

  async send(msg: OtpMessage): Promise<void> {
    if (!msg.phone) throw new Error('No phone number for SMS delivery');
    await this.sendText(msg.phone, otpText(msg));
  }

  /** Send any short text (one-time codes, voter invitations). */
  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authHeader ? { authorization: this.authHeader } : {}),
      },
      body: JSON.stringify({ to, message: text }),
    });
    if (!res.ok) throw new Error(`SMS webhook failed: HTTP ${res.status}`);
  }
}

export interface DevOutboxEntry { electionId: string; memberId: string; code: string; at: string }

/**
 * Selects a configured sender (email first, then SMS per DEC-004 channel
 * order). Falls back to the dev outbox ONLY outside production; in
 * production with no reachable provider it fails closed.
 */
export interface OtpProviderStatus {
  email: boolean;
  smsAfricaTalking: boolean;
  smsWebhook: boolean;
  devAllowed: boolean;
}

export class OtpDelivery {
  readonly devOutbox: DevOutboxEntry[] = [];
  /** Most recent one-time-code delivery problem since this process started. */
  lastError: { at: string; channel: 'email' | 'sms'; message: string } | null = null;
  private readonly smtp: SmtpOtpSender;
  private readonly africasTalking: AfricaTalkingSmsSender;
  private readonly webhook: WebhookSmsSender;
  private readonly senders: OtpSender[];
  private readonly devAllowed: boolean;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.smtp = new SmtpOtpSender(env);
    this.africasTalking = new AfricaTalkingSmsSender(env);
    this.webhook = new WebhookSmsSender(env);
    this.senders = [this.smtp, this.africasTalking, this.webhook];
    this.devAllowed = env.NODE_ENV !== 'production';
  }

  /** Configuration posture for ops dashboards — never exposes secrets. */
  describe(): OtpProviderStatus {
    return {
      email: this.smtp.configured,
      smsAfricaTalking: this.africasTalking.configured,
      smsWebhook: this.webhook.configured,
      devAllowed: this.devAllowed,
    };
  }

  async deliver(msg: OtpMessage): Promise<DeliveryChannel> {
    for (const sender of this.senders) {
      if (!sender.canDeliver(msg)) continue;
      try {
        await sender.send(msg);
        logEvent('info', 'otp.delivered', { electionId: msg.electionId, channel: sender.channel });
        return sender.channel;
      } catch (err) {
        this.lastError = {
          at: new Date().toISOString(), channel: sender.channel,
          message: (err instanceof Error ? err.message : 'unknown error').slice(0, 200),
        };
        // Try the next channel before failing (DEC-004 fallback order).
        logEvent('warn', 'otp.delivery_failed', {
          electionId: msg.electionId, channel: sender.channel,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
    if (this.devAllowed) {
      this.devOutbox.push({ electionId: msg.electionId, memberId: msg.memberId, code: msg.code, at: new Date().toISOString() });
      return 'dev';
    }
    throw new Error('OTP_DELIVERY_UNAVAILABLE: no configured provider could deliver the code');
  }
}
