// Client-side preview for the voter-register CSV import. Mirrors the
// server's parsing rules (apps/api/src/register/csv-import.ts) closely
// enough to show row counts, detected columns, and likely issues before
// the file is submitted - the API remains the authoritative validator.

export interface RegisterPreview {
  headers: string[];
  rowCount: number;
  issueCount: number;
  issues: { line: number; message: string }[];
  sample: string[][];
  hasMemberId: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_HEADERS = ['fullname', 'full_name', 'name'];
const PHONE_HEADERS = ['phone', 'mobile', 'tel'];
const MEMBER_HEADERS = ['memberid', 'member_id', 'voterid', 'voter_id', 'id'];

// Minimal RFC 4180-style parser: handles quoted fields and commas in quotes.
export function parseCsvText(text: string): string[][] {
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

const TEMPLATE = 'memberId,fullName,email,phone\n,Jane Doe,jane@example.org,+231 88 000 0000\n,John Smith,,+231 88 000 0001\n';

export function downloadRegisterTemplate(): void {
  const blob = new Blob([TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voter-register-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function previewRegisterCsv(text: string): RegisterPreview | null {
  const table = parseCsvText(text);
  if (table.length === 0) return null;
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => NAME_HEADERS.includes(h));
  const emailIdx = headers.indexOf('email');
  const phoneIdx = headers.findIndex((h) => PHONE_HEADERS.includes(h));
  const memberIdx = headers.findIndex((h) => MEMBER_HEADERS.includes(h));
  const base = { headers, hasMemberId: memberIdx >= 0 };

  if (nameIdx < 0) {
    return { ...base, rowCount: 0, issueCount: 1, issues: [{ line: 1, message: 'Missing fullName column' }], sample: [] };
  }

  const issues: { line: number; message: string }[] = [];
  let rowCount = 0;
  for (let i = 1; i < table.length; i++) {
    const cols = table[i];
    const get = (j: number) => (j >= 0 ? (cols[j] ?? '').trim() : '');
    if (!get(nameIdx)) { issues.push({ line: i + 1, message: 'Missing fullName' }); continue; }
    rowCount++;
    const email = get(emailIdx);
    const phone = get(phoneIdx);
    if (email && !EMAIL_RE.test(email)) issues.push({ line: i + 1, message: 'Invalid email' });
    else if (!email && !phone) issues.push({ line: i + 1, message: 'No email or phone - voter cannot receive an OTP' });
  }
  return {
    ...base,
    rowCount,
    issueCount: issues.length,
    issues: issues.slice(0, 8),
    sample: table.slice(1, 4),
  };
}
