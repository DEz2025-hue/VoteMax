export type ElectionState =
  | 'DRAFT' | 'CONFIGURED' | 'REGISTRATION' | 'REGISTER_FROZEN' | 'READY'
  | 'OPEN' | 'SUSPENDED' | 'CLOSED' | 'TALLIED' | 'VERIFIED' | 'RECOUNT'
  | 'CERTIFIED' | 'PUBLISHED' | 'ARCHIVED' | 'CANCELLED';

// Transition table from EMP-LIFE-001 section 4 (T1-T16).
// Transitions not listed are prohibited.
export const ALLOWED_TRANSITIONS: Record<ElectionState, ElectionState[]> = {
  DRAFT: ['CONFIGURED', 'CANCELLED'],
  CONFIGURED: ['REGISTRATION', 'CANCELLED'],
  REGISTRATION: ['REGISTER_FROZEN', 'CANCELLED'],
  REGISTER_FROZEN: ['READY', 'CANCELLED'],
  READY: ['OPEN', 'CANCELLED'],
  OPEN: ['SUSPENDED', 'CLOSED'],
  SUSPENDED: ['OPEN', 'CLOSED'],
  CLOSED: ['TALLIED'],
  TALLIED: ['VERIFIED', 'RECOUNT'],
  VERIFIED: ['CERTIFIED', 'RECOUNT'],
  RECOUNT: ['TALLIED'],
  CERTIFIED: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
};

export function assertTransition(from: ElectionState, to: ElectionState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`INVALID_TRANSITION: ${from} -> ${to} is not permitted (EMP-LIFE-001)`);
  }
}

/** Configuration (positions/candidates) may change only before register freeze. */
export function assertConfigEditable(state: ElectionState): void {
  if (!['DRAFT', 'CONFIGURED', 'REGISTRATION'].includes(state)) {
    throw new Error(`CONFIG_FROZEN: election configuration is immutable in state ${state}`);
  }
}

/** Register may change only during REGISTRATION (FR-VOT-005). */
export function assertRegisterEditable(state: ElectionState): void {
  if (state !== 'REGISTRATION') {
    throw new Error(`REGISTER_FROZEN: voter register changes require state REGISTRATION, current ${state}`);
  }
}
