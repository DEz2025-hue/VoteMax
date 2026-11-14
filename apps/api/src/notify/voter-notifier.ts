import nodemailer from 'nodemailer';
import { logEvent } from '../common/logger';
import type { NotificationKind } from '../store/types';

/**
 * Bulk voter notifications (invites + scheduled reminders). Delivery goes
 * through env-configured SMTP (same SMTP_* vars as OTP delivery). When no
 * provider is configured, messages are recorded to an in-process outbox so
 * the flow is exercisable in development; production should set SMTP_*.
 */

export interface VoterMessage {
  to: string;
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

export class VoterNotifier {
  readonly configured: boolean;
  readonly outbox: VoterMessage[] = [];
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.from = env.SMTP_FROM ?? env.SMTP_USER ?? 'VoteMax <no-reply@votemax.local>';
    this.configured = Boolean(env.SMTP_HOST);
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    }
  }

  async send(msg: VoterMessage): Promise<'email' | 'dev'> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
      return 'email';
    }
    this.outbox.push(msg);
    logEvent('info', 'notify.dev_outbox', { to: msg.to, subject: msg.subject });
    return 'dev';
  }
}
