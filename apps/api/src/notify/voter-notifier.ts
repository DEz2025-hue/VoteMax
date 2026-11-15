import nodemailer from 'nodemailer';
import { logEvent } from '../common/logger';
import { AfricaTalkingSmsSender, WebhookSmsSender } from '../otp/otp-delivery';
import type { NotificationKind } from '../store/types';

/**
 * Bulk voter notifications (invitations + scheduled reminders). Each message
 * carries the voter's member ID and a personal voting link.
 *
 * Delivery order per voter: email (SMTP_* env) first; if the voter has no
 * email, or the email fails, SMS through the same providers as one-time codes
 * (Africa's Talking, or the generic SMS webhook). In development with no
 * provider configured, messages go to an in-process outbox so the flow can be
 * exercised. In production an undeliverable message is a FAILURE — it is never
 * recorded as sent.
 */

export interface VoterMessage {
  /** Email address, if the voter has one. */
  email?: string;
  /** Phone number, if the voter has one. */
  phone?: string;
  subject: string;
  /** Full email body. */
  text: string;
  /** Short text for SMS. */
  sms: string;
}

export type DeliveryChannel = 'email' | 'sms' | 'dev';

export interface OutboxEntry {
  to: string;
  channel: 'email' | 'sms';
  subject: string;
  text: string;
}

export interface NotificationContext {
  organizationName: string;
  electionName: string;
  memberId: string;
  link: string;
  votingOpensAt: string | null;
  votingClosesAt: string | null;
}

export function renderVoterMessage(kind: NotificationKind, ctx: NotificationContext): { subject: string; text: string } {
  const window =
    ctx.votingOpensAt && ctx.votingClosesAt
      ? ` Voting is open from ${ctx.votingOpensAt} to ${ctx.votingClosesAt} (times shown in your local timezone).`
      : '';
  switch (kind) {
    case 'invite':
      return {
        subject: `You're eligible to vote — ${ctx.electionName}`,
        text:
          `Hello,\n\nYou are eligible to vote in "${ctx.electionName}" organized by ${ctx.organizationName}.\n\n` +
          `Your member ID: ${ctx.memberId}\n` +
          `Vote here: ${ctx.link}\n` +
          window +
          `\n\nYou will receive a one-time verification code when you vote. Never share it with anyone.`,
      };
    case 'reminder_open':
      return {
        subject: `Voting opens soon — ${ctx.electionName}`,
        text:
          `Hello,\n\nVoting for "${ctx.electionName}" (${ctx.organizationName}) is about to begin.${window}\n\n` +
          `Your member ID: ${ctx.memberId}\nVote here: ${ctx.link}\n\nCast your ballot before it closes.`,
      };
    case 'reminder_close':
      return {
        subject: `Last chance to vote — ${ctx.electionName}`,
        text:
          `Hello,\n\nVoting for "${ctx.electionName}" (${ctx.organizationName}) closes soon.${window}\n\n` +
          `Your member ID: ${ctx.memberId}\nVote here: ${ctx.link}\n\nThis is your final reminder — ballots cannot be cast after closing.`,
      };
  }
}

/** Short SMS version: who, which election, the member ID and the link. */
export function renderVoterSms(kind: NotificationKind, ctx: NotificationContext): string {
  const lead =
    kind === 'invite' ? `${ctx.organizationName}: you can vote in "${ctx.electionName}".`
    : kind === 'reminder_open' ? `${ctx.organizationName}: voting in "${ctx.electionName}" opens soon.`
    : `${ctx.organizationName}: last chance to vote in "${ctx.electionName}".`;
  return `${lead} Your member ID: ${ctx.memberId}. Vote: ${ctx.link} You'll get a one-time code when you vote - never share it.`;
}

interface SmsSender { readonly configured: boolean; sendText(to: string, text: string): Promise<void> }

export class VoterNotifier {
  readonly configured: boolean;
  readonly outbox: OutboxEntry[] = [];
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly smsSenders: SmsSender[];
  private readonly devAllowed: boolean;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.from = env.SMTP_FROM ?? env.SMTP_USER ?? 'VoteMax <no-reply@votemax.local>';
    this.devAllowed = env.NODE_ENV !== 'production';
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    }
    this.smsSenders = [new AfricaTalkingSmsSender(env), new WebhookSmsSender(env)].filter((s) => s.configured);
    this.configured = this.transporter !== null || this.smsSenders.length > 0;
  }

  async send(msg: VoterMessage): Promise<DeliveryChannel> {
    if (msg.email && this.transporter) {
      try {
        await this.transporter.sendMail({ from: this.from, to: msg.email, subject: msg.subject, text: msg.text });
        return 'email';
      } catch (err) {
        // Fall through to SMS when the voter has a phone number.
        logEvent('warn', 'notify.email_failed', { error: err instanceof Error ? err.message : 'unknown' });
      }
    }
    if (msg.phone) {
      for (const sender of this.smsSenders) {
        try {
          await sender.sendText(msg.phone, msg.sms);
          return 'sms';
        } catch (err) {
          logEvent('warn', 'notify.sms_failed', { error: err instanceof Error ? err.message : 'unknown' });
        }
      }
    }
    if (this.devAllowed) {
      const viaEmail = Boolean(msg.email);
      this.outbox.push({ to: (viaEmail ? msg.email : msg.phone) as string, channel: viaEmail ? 'email' : 'sms', subject: msg.subject, text: viaEmail ? msg.text : msg.sms });
      logEvent('info', 'notify.dev_outbox', { channel: viaEmail ? 'email' : 'sms', subject: msg.subject });
      return 'dev';
    }
    // Production with no working channel: surface it as a failure so the
    // officer sees it, instead of counting an unsent message as sent.
    throw new Error('INVITE_UNDELIVERABLE: no configured channel could reach this voter');
  }
}
