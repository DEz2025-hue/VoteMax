/**
 * Friendly errors. The API reports problems as "CODE: technical detail"
 * (e.g. "INVALID_STATE: certification requires VERIFIED, current REGISTRATION").
 * That is useful for engineers and alarming for everyone else, so every
 * message shown to people goes through toFriendly():
 *
 *  - plain language, no codes or jargon
 *  - a calm "what to do next" hint where we can offer one
 *  - "guidance" severity for expected situations (not ready yet, no
 *    permission, wrong code) vs "error" for genuine failures
 *  - the original text is kept as `technical` for support, never as the headline
 *
 * Pure module (no imports) so it can be tested without a browser.
 */

export type Severity = 'guidance' | 'error';

export interface FriendlyError {
  /** Short headline, e.g. "Not available yet". */
  title: string;
  /** One or two plain sentences. */
  message: string;
  /** What to do next, when known. */
  hint?: string;
  severity: Severity;
  /** Original API code, e.g. INVALID_STATE (for logic, not for display). */
  code: string;
  /** Original technical text - for support and logs only. */
  technical: string;
}

/** An Error that already carries its friendly form. */
export class AppError extends Error {
  readonly friendly: FriendlyError;
  readonly status: number;
  constructor(friendly: FriendlyError, status = 0) {
    super(friendly.message);
    this.name = 'AppError';
    this.friendly = friendly;
    this.status = status;
  }
  get code(): string { return this.friendly.code; }
}

const STATE_LABEL: Record<string, string> = {
  DRAFT: 'a draft',
  CONFIGURED: 'configured',
  REGISTRATION: 'in voter registration',
  REGISTER_FROZEN: 'waiting to be marked ready',
  READY: 'ready to open',
  OPEN: 'open for voting',
  SUSPENDED: 'paused',
  CLOSED: 'closed',
  TALLIED: 'counted (awaiting verification)',
  VERIFIED: 'verified',
  RECOUNT: 'being recounted',
  CERTIFIED: 'certified',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
};

const STATE_NEXT_STEP: Record<string, string> = {
  DRAFT: 'Finish the election details and ballot in Election setup.',
  CONFIGURED: 'Open voter registration, import your voters, then lock the register.',
  REGISTRATION: 'Import your voters, resolve any duplicates, lock the register, then mark the election ready and open voting.',
  REGISTER_FROZEN: 'Mark the election ready, then open voting.',
  READY: 'Open voting when you are ready to start.',
  OPEN: 'Close voting once the voting window has ended.',
  SUSPENDED: 'Resume voting, or close it if the election is over.',
  CLOSED: 'Run the tally next.',
  TALLIED: 'Verify the tally next.',
  VERIFIED: 'Certify the results next.',
  RECOUNT: 'Finish the recount to continue.',
  CERTIFIED: 'Publish the results next.',
  PUBLISHED: 'The election is complete.',
};

function stateLabel(s: string): string { return STATE_LABEL[s] ?? s.toLowerCase().replace(/_/g, ' '); }

function requiredStates(detail: string): string[] {
  const m = /requires?\s+([A-Z_]+(?:\s+or\s+[A-Z_]+)*)/.exec(detail);
  return m ? m[1].split(/\s+or\s+/) : [];
}

function make(
  code: string, technical: string, severity: Severity,
  title: string, message: string, hint?: string,
): FriendlyError {
  return { code, technical, severity, title, message, hint };
}

/** Split "CODE: detail". Falls back to ('', raw). */
export function splitCode(raw: string): { code: string; detail: string } {
  const m = /^([A-Z][A-Z0-9_]+):\s*([\s\S]*)$/.exec(raw.trim());
  return m ? { code: m[1], detail: m[2].trim() } : { code: '', detail: raw.trim() };
}

function byStatus(status: number, raw: string): FriendlyError {
  if (status === 401) {
    return make('AUTH_REQUIRED', raw, 'guidance', 'Please sign in again', 'Your session has ended.', 'Sign in again to carry on where you left off.');
  }
  if (status === 403) {
    return make('FORBIDDEN', raw, 'guidance', 'Not allowed', "Your account doesn't have permission to do this.", 'Ask your organization owner to check your access.');
  }
  if (status === 404) {
    return make('NOT_FOUND', raw, 'guidance', "Couldn't find that", "We couldn't find what you were looking for. It may have been removed.", 'Try refreshing the page.');
  }
  if (status === 429) {
    return make('FRAUD_THROTTLED', raw, 'guidance', 'Please slow down', "You're going a little fast.", 'Wait a moment, then try again.');
  }
  if (status >= 500) {
    return make('SERVER_ERROR', raw, 'error', 'Something went wrong on our side', "That didn't work, and it isn't your fault. Nothing you entered has been lost or changed.", 'Please try again in a moment. If it keeps happening, contact support.');
  }
  return make('REQUEST_FAILED', raw, 'error', "That didn't work", "We couldn't complete that request.", 'Please check what you entered and try again.');
}

/**
 * Translate an API error. `raw` is the API's message ("CODE: detail", or
 * plain text); `status` is the HTTP status when known.
 */
export function toFriendly(raw: string, status = 0): FriendlyError {
  const { code, detail } = splitCode(raw || '');

  switch (code) {
    // ---- lifecycle / state ----
    case 'INVALID_STATE': {
      const current = /current\s+([A-Z_]+)/.exec(detail)?.[1];
      const need = requiredStates(detail);
      const where = current ? `The election is currently ${stateLabel(current)}.` : 'The election is not at the right stage yet.';
      const when = need.length ? ` This step becomes available once it is ${need.map(stateLabel).join(' or ')}.` : '';
      return make(code, raw, 'guidance', 'Not available yet', `This step isn't available yet. ${where}${when}`.trim(),
        current ? STATE_NEXT_STEP[current] : undefined);
    }
    case 'INVALID_TRANSITION': {
      // Server detail looks like "REGISTRATION -> READY is not permitted (...)".
      const m = /([A-Z_]+)\s*->\s*([A-Z_]+)/.exec(detail);
      if (m) {
        const [, from, to] = m;
        if (from === to) {
          return make(code, raw, 'guidance', 'Already done', `The election is already ${stateLabel(from)}, so there is nothing more to do for this step.`);
        }
        return make(code, raw, 'guidance', 'Not available yet',
          `The election is currently ${stateLabel(from)}, so it can't move to ${stateLabel(to)} yet.`,
          STATE_NEXT_STEP[from] ?? 'Use the guided steps in Election setup, they take you through each stage in order.');
      }
      return make(code, raw, 'guidance', 'Not available yet', "The election can't move to that stage from where it is now.", 'Use the guided steps in Election setup, they take you through each stage in order.');
    }
    case 'CONFIG_FROZEN':
      return make(code, raw, 'guidance', 'Ballot is locked', "The ballot can't be changed any more because the voter register has been locked.");
    case 'REGISTER_FROZEN':
      return make(code, raw, 'guidance', 'Register is locked', "The voter register can only be changed during voter registration, and that stage has passed.");
    case 'PRECONDITION': {
      const d = detail.toLowerCase();
      if (d.includes('at least one position')) return make(code, raw, 'guidance', 'One more thing first', 'Add at least one position to the ballot before continuing.');
      if (d.includes('at least one candidate')) return make(code, raw, 'guidance', 'One more thing first', 'Add at least one candidate before continuing.');
      if (d.includes('voting window')) return make(code, raw, 'guidance', 'One more thing first', 'Set when voting opens and closes before continuing.', 'You can do this in the Details step of Election setup.');
      if (d.includes('register must be frozen')) return make(code, raw, 'guidance', 'One more thing first', 'Lock the voter register before marking the election ready.');
      const dup = /(\d+)\s+duplicate/.exec(detail);
      if (dup) return make(code, raw, 'guidance', 'One more thing first', `Resolve the ${dup[1]} duplicate voter ${Number(dup[1]) === 1 ? 'record' : 'records'} before locking the register.`, 'Open Voter register and choose "Eligible" or "Ineligible" for each one.');
      if (d.startsWith('waiting for')) return make(code, raw, 'guidance', 'Waiting for sign-off', `${detail.replace(/^./, (c) => c.toUpperCase())}.`, 'They can approve under Results and reports; the form fills in once they do.');
      if (d.includes('two approvers')) return make(code, raw, 'guidance', 'One more thing first', 'Choose two different approvers to run the tally.');
      if (d.includes('must be an auditor')) return make(code, raw, 'guidance', 'One more thing first', 'At least one of the approvers must be an auditor.');
      return make(code, raw, 'guidance', 'One more thing first', detail ? `${detail.replace(/\s*\([^)]*\)\s*$/, '').replace(/^./, (c) => c.toUpperCase())}.` : 'Something needs to be completed before this step.');
    }
    case 'RECONCILIATION':
    case 'BLOCKER':
      if (detail.toLowerCase().includes('only owner')) return make(code, raw, 'guidance', "Can't remove the only owner", 'Every organization needs at least one owner.', 'Add another owner first, then remove this one.');
      return make(code, raw, 'guidance', "Can't continue yet", "We found a mismatch that has to be resolved before this step can go ahead, to keep the election accurate.", 'Share the technical details below with your platform administrator.');

    // ---- permissions / separation of duties ----
    case 'FORBIDDEN': {
      const d = detail.toLowerCase();
      if (d.includes('authorized by the organization owner')) return make(code, raw, 'guidance', 'Choose an owner', 'The person who authorizes the tally must be an organization owner.');
      if (d.includes('oversight role')) return make(code, raw, 'guidance', 'Check the approvers', 'Approvers must be organization owners or auditors for this election.');
      if (d.includes('certifiedby')) return make(code, raw, 'guidance', 'Sign in as the certifier', 'Certification has to be done by the person who is signed in.');
      return make(code, raw, 'guidance', 'Not allowed', "Your account doesn't have permission to do this.", 'Ask your organization owner to check your access.');
    }
    case 'SOD_VIOLATION':
      return make(code, raw, 'guidance', 'A different person is needed', 'To keep the election independent, the same person cannot do both of these steps.', 'Choose someone else for this role.');
    case 'TENANT_REQUIRED':
    case 'CROSS_TENANT_ACCESS':
      return make(code, raw, 'guidance', 'Account not linked', "Your account isn't linked to an organization yet.", 'Contact your platform administrator.');

    // ---- sign in ----
    case 'AUTH_REQUIRED':
      return make(code, raw, 'guidance', 'Please sign in again', 'Your session has ended.', 'Sign in again to carry on.');
    case 'AUTH_FAILED':
      return /mfa|code/i.test(detail)
        ? make(code, raw, 'guidance', "That code isn't right", "The authentication code wasn't accepted.", 'Open your authenticator app and enter the current 6-digit code.')
        : make(code, raw, 'guidance', "Those details don't match", 'The email or password is incorrect.', 'Check them and try again.');
    case 'MFA_REQUIRED':
      return make(code, raw, 'guidance', 'One more step', 'Enter the 6-digit code from your authenticator app to sign in.');
    case 'AUTH_LOCKED':
      return make(code, raw, 'guidance', 'Please wait a few minutes', 'There have been several unsuccessful sign-in attempts, so sign-in is paused briefly to protect the account.', 'Try again in about five minutes.');
    case 'WEAK_PASSWORD':
      return make(code, raw, 'guidance', 'Choose a longer password', 'Passwords need at least 12 characters.');
    case 'EMAIL_EXISTS':
      return make(code, raw, 'guidance', 'Email already in use', 'Someone already uses that email address.', 'Use a different email.');

    // ---- voting ----
    case 'OTP_INVALID':
      return make(code, raw, 'guidance', "That code doesn't match", "The code you entered isn't correct.", 'Check the latest message and try again.');
    case 'OTP_EXPIRED':
      return make(code, raw, 'guidance', "That code can't be used", 'It has timed out (codes last 10 minutes) or was already used - each code works once.', 'Go back and ask for a new code.');
    case 'OTP_LOCKED':
      return make(code, raw, 'guidance', 'Too many attempts', 'That code can no longer be used.', 'Go back and ask for a new one.');
    case 'OTP_RATE_LIMITED':
      return make(code, raw, 'guidance', 'Please wait a little', "There have been a lot of attempts in a short time.", 'Wait a few minutes, then try again.');
    case 'LINK_INVALID':
      return make(code, raw, 'guidance', "This voting link isn't valid", "We couldn't match this link to a voter on the list. It may be incomplete or copied wrongly.", 'Open the link from your invitation message again, or contact your election officer.');
    case 'OTP_DELIVERY_UNAVAILABLE':
      return make(code, raw, 'error', "We couldn't send your code", "Something stopped your code from being delivered.", 'Please try again shortly, or contact your election officer.');
    case 'ELECTION_NOT_OPEN': {
      if (/not opened/i.test(detail)) return make(code, raw, 'guidance', "Voting hasn't started", "Voting for this election hasn't opened yet.", 'Come back once voting opens - your invitation has the times.');
      if (/closed/i.test(detail)) return make(code, raw, 'guidance', 'Voting has ended', 'The voting window for this election has closed.');
      return make(code, raw, 'guidance', 'Voting is not open', 'This election is not open for voting right now.');
    }
    case 'NOT_ELIGIBLE':
      return make(code, raw, 'guidance', "We couldn't find you", "We couldn't find you on this election's voter list.", 'Check your member ID, or contact your election officer.');
    case 'ALREADY_VOTED':
      return make(code, raw, 'guidance', "You've already voted", 'Our records show a ballot has already been submitted for this member ID, so it can’t be used again.', "If you didn't vote, contact your election officer.");
    case 'SESSION_INVALID':
      return make(code, raw, 'guidance', 'Your session timed out', 'For your security, voting sessions only last a short while.', 'Please start again - it only takes a minute.');
    case 'INVALID_BALLOT':
      return make(code, raw, 'guidance', 'Please check your choices', "Something in your selections isn't valid for this ballot.", 'Go back and review each position.');
    case 'RESULTS_RESTRICTED':
      return make(code, raw, 'guidance', 'Results are hidden for now', 'Results stay private until they are published.');
    case 'NOTIFICATION_EXISTS':
      return make(code, raw, 'guidance', 'Already sent', 'That reminder has already gone out for this election.');

    // ---- general ----
    case 'NOT_FOUND':
      return make(code, raw, 'guidance', "Couldn't find that", "We couldn't find what you were looking for. It may have been removed.", 'Try refreshing the page.');
    case 'INVALID_INPUT':
      return make(code, raw, 'guidance', 'Please check the details', detail ? `${detail.replace(/^./, (c) => c.toUpperCase())}${/[.!?]$/.test(detail) ? '' : '.'}` : 'Some of the details need another look.');
    case 'FRAUD_BLOCKED':
      return make(code, raw, 'guidance', 'Paused for security', "For security, we've paused requests from this device for a while.", "If you're a genuine voter, try again later or contact your election officer.");
    case 'FRAUD_THROTTLED':
      return make(code, raw, 'guidance', 'Please slow down', "You're going a little fast.", 'Wait a moment, then try again.');
    default:
      return byStatus(status, raw);
  }
}

/** Offline / DNS / CORS failures - fetch() rejects with a TypeError. */
export function networkError(technical = 'network error'): FriendlyError {
  return make('NETWORK', technical, 'error', "Can't reach the server", "We couldn't connect. Nothing you entered has been lost.", 'Check your internet connection and try again.');
}

/** Normalise anything thrown into a FriendlyError. */
export function friendlyFromUnknown(err: unknown): FriendlyError {
  if (err instanceof AppError) return err.friendly;
  if (err instanceof TypeError) return networkError(err.message);
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const { code } = splitCode(raw);
  // Plain-language errors thrown by the UI itself ("Pick a start time.") are
  // already meant for people - show them as written.
  if (!code && raw && /^[A-Z]/.test(raw) && !/^(HTTP \d+|Unauthorized|Forbidden|Internal)/.test(raw)) {
    return make('INVALID_INPUT', raw, 'guidance', 'Please check the details', raw);
  }
  return toFriendly(raw);
}
