import nodemailer from 'nodemailer';
import { logEvent } from '../common/logger';
import { AfricaTalkingSmsSender, WebhookSmsSender } from '../otp/otp-delivery';
import { HttpEmailSender } from '../mail/email-api';
import type { NotificationKind } from '../store/types';
import { renderResultsEmail, renderResultsSms, type ResultsSummary } from './results-email';

/**
 * Bulk voter notifications (invitations + scheduled reminders). Each message
 * carries the voter's member ID and a personal voting link.
 *
 * Delivery order per voter: email (SMTP_* env) first; if the voter has no
 * email, or the email fails, SMS through the same providers as one-time codes
 * (Africa's Talking, or the generic SMS webhook). In development with no
 * provider configured, messages go to an in-process outbox so the flow can be
 * exercised. In production an undeliverable message is a FAILURE - it is never
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
  /** Who won what (results notifications only). */
  results?: ResultsSummary;
  announcement?: string | null;
}

/** Sent from a no-reply address, so say so and point voters to a real contact. */
export const NO_REPLY_NOTE =
  '\n\n--\nThis is an automated message from VoteMax. Please do not reply to it; if you need help, contact your election officer.';

export function renderVoterMessage(kind: NotificationKind, ctx: NotificationContext): { subject: string; text: string } {
  const window =
    ctx.votingOpensAt && ctx.votingClosesAt
      ? ` Voting is open from ${ctx.votingOpensAt} to ${ctx.votingClosesAt} (times shown in your local timezone).`
      : '';
  switch (kind) {
    case 'invite':
      return {
        subject: `You're eligible to vote - ${ctx.electionName}`,
        text:
          `Hello,\n\nYou are eligible to vote in "${ctx.electionName}" organized by ${ctx.organizationName}.\n\n` +
          `Your member ID: ${ctx.memberId}\n` +
          `Vote here: ${ctx.link}\n` +
          window +
          `\n\nThis link is personal to you and is all you need to vote - there is no code to enter. ` +
          `Keep it secret: do not share or forward this message, because anyone with the link can vote as you.` + NO_REPLY_NOTE,
      };
    case 'reminder_open':
      return {
        subject: `Voting opens soon - ${ctx.electionName}`,
        text:
          `Hello,\n\nVoting for "${ctx.electionName}" (${ctx.organizationName}) is about to begin.${window}\n\n` +
          `Your member ID: ${ctx.memberId}\nVote here: ${ctx.link}\n\nCast your ballot before it closes.` + NO_REPLY_NOTE,
      };
    case 'reminder_close':
      return {
        subject: `Last chance to vote - ${ctx.electionName}`,
        text:
          `Hello,\n\nVoting for "${ctx.electionName}" (${ctx.organizationName}) closes soon.${window}\n\n` +
          `Your member ID: ${ctx.memberId}\nVote here: ${ctx.link}\n\nThis is your final reminder - ballots cannot be cast after closing.` + NO_REPLY_NOTE,
      };
    case 'results': {
      // The official announcement: same for everyone, no personal link or member ID.
      const email = renderResultsEmail(ctx, ctx.results ?? { totalVotes: 0, positions: [] });
      return { subject: email.subject, text: email.text + NO_REPLY_NOTE };
    }
  }
}

/** Short SMS version: who, which election, the member ID and the link. */
export function renderVoterSms(kind: NotificationKind, ctx: NotificationContext): string {
  if (kind === 'results') {
    return renderResultsSms(ctx, ctx.results ?? { totalVotes: 0, positions: [] });
  }
  const lead =
    kind === 'invite' ? `${ctx.organizationName}: you can vote in "${ctx.electionName}".`
    : kind === 'reminder_open' ? `${ctx.organizationName}: voting in "${ctx.electionName}" opens soon.`
    : `${ctx.organizationName}: last chance to vote in "${ctx.electionName}".`;
  return `${lead} Your member ID: ${ctx.memberId}. Vote: ${ctx.link} This link is personal to you - never share it.`;
}

interface SmsSender { readonly configured: boolean; sendText(to: string, text: string): Promise<void> }

export class VoterNotifier {
  readonly configured: boolean;
  readonly outbox: OutboxEntry[] = [];
  /** Most recent delivery problem since this process started (for ops visibility). */
  lastError: { at: string; channel: 'email' | 'sms'; message: string } | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private readonly httpEmail: HttpEmailSender;
  private readonly from: string;
  private readonly smsSenders: SmsSender[];
  private readonly devAllowed: boolean;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.from = env.SMTP_FROM ?? env.SMTP_USER ?? 'VoteMax <no-reply@votemax.local>';
    this.devAllowed = env.NODE_ENV !== 'production';
    this.httpEmail = new HttpEmailSender(env);
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        // Fail fast: nodemailer's defaults wait ~2 minutes per message, so one
        // unreachable mail server made a whole batch look stuck on "running".
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    this.smsSenders = [new AfricaTalkingSmsSender(env), new WebhookSmsSender(env)].filter((s) => s.configured);
    this.configured = this.transporter !== null || this.httpEmail.configured || this.smsSenders.length > 0;
  }

  private noteError(channel: 'email' | 'sms', err: unknown): void {
    this.lastError = {
      at: new Date().toISOString(), channel,
      message: (err instanceof Error ? err.message : 'unknown error').slice(0, 200),
    };
  }

  async send(msg: VoterMessage): Promise<DeliveryChannel> {
    // Email: the HTTPS provider API first (works where SMTP ports are blocked),
    // then SMTP; either failing falls through to SMS when the voter has a phone.
    if (msg.email && this.httpEmail.configured) {
      try {
        await this.httpEmail.send({ to: msg.email, subject: msg.subject, text: msg.text });
        return 'email';
      } catch (err) {
        this.noteError('email', err);
        logEvent('warn', 'notify.email_failed', { via: this.httpEmail.provider, error: err instanceof Error ? err.message : 'unknown' });
      }
    }
    if (msg.email && this.transporter) {
      try {
        await this.transporter.sendMail({ from: this.from, to: msg.email, subject: msg.subject, text: msg.text });
        return 'email';
      } catch (err) {
        // Fall through to SMS when the voter has a phone number.
        this.noteError('email', err);
        logEvent('warn', 'notify.email_failed', { error: err instanceof Error ? err.message : 'unknown' });
      }
    }
    if (msg.phone) {
      for (const sender of this.smsSenders) {
        try {
          await sender.sendText(msg.phone, msg.sms);
          return 'sms';
        } catch (err) {
          this.noteError('sms', err);
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
