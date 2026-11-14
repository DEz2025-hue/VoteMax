import { createHash, randomUUID } from 'node:crypto';

export interface VoterRow {
  memberId: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface ParsedRegister {
  rows: VoterRow[];
  errors: { line: number; message: string }[];
}

// Minimal RFC 4180-style parser: handles quoted fields and commas in quotes.
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim().length > 0));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRegisterCsv(text: string): ParsedRegister {
  const table = parseCsv(text);
  const errors: ParsedRegister['errors'] = [];
  const rows: VoterRow[] = [];
  if (table.length === 0) return { rows, errors: [{ line: 1, message: 'Empty file' }] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = {
    memberId: header.findIndex((h) => ['memberid', 'member_id', 'voterid', 'voter_id', 'id'].includes(h)),
    fullName: header.findIndex((h) => ['fullname', 'full_name', 'name'].includes(h)),
    email: header.findIndex((h) => h === 'email'),
    phone: header.findIndex((h) => ['phone', 'mobile', 'tel'].includes(h)),
  };
  if (idx.memberId < 0 || idx.fullName < 0) {
    return { rows, errors: [{ line: 1, message: 'Header must include memberId and fullName columns' }] };
  }

  for (let i = 1; i < table.length; i++) {
    const cols = table[i];
    const get = (j: number) => (j >= 0 ? (cols[j] ?? '').trim() : '');
    const memberId = get(idx.memberId);
    const fullName = get(idx.fullName);
    const email = get(idx.email);
    const phone = get(idx.phone);
    if (!memberId) { errors.push({ line: i + 1, message: 'Missing memberId' }); continue; }
    if (!fullName) { errors.push({ line: i + 1, message: `Missing fullName for ${memberId}` }); continue; }
    if (email && !EMAIL_RE.test(email)) { errors.push({ line: i + 1, message: `Invalid email for ${memberId}` }); continue; }
    if (!email && !phone) { errors.push({ line: i + 1, message: `No contact (email or phone) for ${memberId}` }); continue; }
    rows.push({ memberId, fullName, email, phone });
  }
  return { rows, errors };
}

export type VoterStatus = 'pending' | 'eligible' | 'ineligible' | 'duplicate_unresolved' | 'suspended';

export interface VoterRecord extends VoterRow {
  id: string;
  electionId: string;
  status: VoterStatus;
  statusReason: string | null;
}

export interface ImportResult {
  imported: VoterRecord[];
  duplicates: VoterRecord[];
  errors: { line: number; message: string }[];
}

/**
 * Validate and de-duplicate an import against existing records.
 * Duplicates (same memberId, or same non-empty email) are never silently
 * dropped: they are stored as duplicate_unresolved (FR-VOT-002).
 */
export function importRows(
  electionId: string,
  rows: VoterRow[],
  errors: ParsedRegister['errors'],
  existing: VoterRecord[],
): ImportResult {
  const seenIds = new Set(existing.map((r) => r.memberId.toLowerCase()));
  const seenEmails = new Set(existing.filter((r) => r.email).map((r) => r.email.toLowerCase()));
  const imported: VoterRecord[] = [];
  const duplicates: VoterRecord[] = [];

  for (const row of rows) {
    const isDup =
      seenIds.has(row.memberId.toLowerCase()) ||
      (row.email.length > 0 && seenEmails.has(row.email.toLowerCase()));
    const record: VoterRecord = {
      ...row,
      id: randomUUID(),
      electionId,
      status: isDup ? 'duplicate_unresolved' : 'eligible',
      statusReason: isDup ? 'Duplicate memberId or email; registrar resolution required' : null,
    };
    (isDup ? duplicates : imported).push(record);
    seenIds.add(row.memberId.toLowerCase());
    if (row.email) seenEmails.add(row.email.toLowerCase());
  }
  return { imported, duplicates, errors };
}

export function registerHash(records: VoterRecord[]): string {
  const eligibleIds = records
    .filter((r) => r.status === 'eligible')
    .map((r) => r.memberId)
    .sort();
  return createHash('sha256').update(eligibleIds.join('\n')).digest('hex');
}
