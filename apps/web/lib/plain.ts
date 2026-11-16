/**
 * Plain-language labels for things the API reports in internal terms.
 * The screens never show IDs, hashes, or raw codes; these turn them into
 * words people recognise.
 */

const ACTIONS: Record<string, string> = {
  'auth.login': 'Signed in',
  'user.create': 'Created a user',
  'user.delete': 'Removed a user',
  'user.totpReset': 'Reset an authenticator',
  'role.assign': 'Assigned a role',
  'organization.create': 'Created an organization',
  'election.create': 'Created an election',
  'election.update': 'Updated an election',
  'election.transition': 'Moved the election to a new stage',
  'election.autoOpen': 'Opened voting automatically',
  'election.autoClose': 'Closed voting automatically',
  'election.close': 'Closed voting',
  'register.import': 'Imported voters',
  'register.freeze': 'Locked the voter register',
  'voting.linkEnter': 'A voter opened their link',
  'voting.submit': 'A ballot was cast',
  'tally.execute': 'Counted the votes',
  'tally.verify': 'Verified the count',
  'tally.recount': 'Started a recount',
  'results.certify': 'Certified the results',
  'results.publish': 'Published the results',
  'approval.record': 'Approved a step',
  'approval.withdraw': 'Withdrew an approval',
  'notify.queue': 'Sent messages to voters',
  'notify.complete': 'Finished sending messages',
  'notify.failed': 'Some messages could not be sent',
};

/** "results.publish" -> "Published the results"; unknown codes become readable words. */
export function plainAction(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const words = action.replace(/[._]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
}

/** "success:ballots=5,hash=ab12..." -> a word and a tone. Details never reach the screen. */
export function plainOutcome(outcome: string): { label: string; tone: 'success' | 'error' | 'warning' } {
  const o = outcome.toLowerCase();
  if (o.startsWith('success')) return { label: 'Done', tone: 'success' };
  if (o.startsWith('denied')) return { label: 'Not allowed', tone: 'error' };
  if (o.includes('fail') || o.startsWith('error')) return { label: 'Failed', tone: 'error' };
  return { label: 'Noted', tone: 'warning' };
}

/** "election:4f3c..." -> "An election". The ID is not shown. */
export function plainTarget(scope: string): string {
  const kind = scope.split(':')[0]?.toLowerCase();
  switch (kind) {
    case 'election': return 'An election';
    case 'user': return 'A user';
    case 'organization': case 'org': return 'The organization';
    case 'voter': return 'A voter';
    case 'ballot': return 'A ballot';
    default: return '-';
  }
}

/** Who did it, by name when we know them. */
export function plainActor(actorId: string | null, nameOf: (id: string) => string | undefined): string {
  if (!actorId) return 'A voter or the system';
  if (actorId === 'bootstrap') return 'First-time setup';
  if (actorId.startsWith('system:')) return 'The system';
  return nameOf(actorId) ?? 'A staff member';
}

/** "otp_actor_velocity" -> "Otp actor velocity" style fallback for rule names. */
export function plainRule(rule: string): string {
  const words = rule.replace(/[._]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '-';
}

export function plainSignal(kind: string | null | undefined): string {
  if (kind === 'ip') return 'Network address';
  if (kind === 'device') return 'Device';
  if (kind === 'actor') return 'Voter session';
  return '-';
}

/**
 * True when a server message is written for people. Messages that mention
 * field names, identifiers, hashes or internal rule references are not.
 */
export function isPlainMessage(text: string): boolean {
  if (!text) return false;
  if (/[_{}[\]<>]|->|=>/.test(text)) return false;                    // snake_case, braces, arrows
  if (/\b[a-z]+[A-Z][A-Za-z]*\b/.test(text)) return false;            // camelCase identifiers
  if (/[0-9a-f]{8}-[0-9a-f]{4}-|[0-9a-f]{32,}/i.test(text)) return false; // UUIDs, hashes
  if (/\((?:SoD|SEC|FR|T)[-\d]|§|\bSEC-|\bFR-/.test(text)) return false; // internal rule references
  if (/'[^']*'/.test(text)) return false;                             // quoted field values
  return true;
}
