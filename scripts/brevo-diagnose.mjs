/**
 * Brevo diagnostics — shows why a message was not delivered.
 * Prints: your verified senders, domain authentication status, and the most
 * recent delivery events (including Brevo's own `reason` for any error/bounce).
 * Read-only; sends nothing.
 *
 * Usage (PowerShell; the key stays in your shell):
 *   $env:EMAIL_API_KEY="<api key>"
 *   node scripts/brevo-diagnose.mjs [recipient@address]
 */
const key = process.env.EMAIL_API_KEY;
const recipient = process.argv[2];
if (!key) { console.error('Set EMAIL_API_KEY first.'); process.exit(2); }

async function get(path) {
  const res = await fetch('https://api.brevo.com/v3' + path, {
    headers: { 'api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const acct = await get('/account');
if (acct.status !== 200) {
  console.error(`Could not read the account (HTTP ${acct.status}): ${JSON.stringify(acct.data).slice(0, 300)}`);
  if (/unrecogni[sz]ed IP/i.test(JSON.stringify(acct.data))) console.error('Hint: deactivate IP blocking at https://app.brevo.com/security/authorised_ips');
  process.exit(1);
}
console.log(`Account: ${acct.data.email ?? '?'} — plan: ${(acct.data.plan ?? []).map((p) => `${p.type}${p.credits !== undefined ? ` (${p.credits} credits)` : ''}`).join(', ') || '?'}`);

console.log('\n== Senders (must be active to send from them) ==');
const s = await get('/senders');
for (const x of s.data.senders ?? []) console.log(`  ${x.active ? 'ACTIVE  ' : 'INACTIVE'} ${x.name ?? ''} <${x.email}>`);
if (!(s.data.senders ?? []).length) console.log('  (none — add and verify a sender in Brevo)');

console.log('\n== Domains (authenticated = DKIM/DMARC set up) ==');
const d = await get('/senders/domains');
for (const x of d.data.domains ?? []) console.log(`  ${x.domain_name ?? x.domain}: verified=${x.verified} authenticated=${x.authenticated}`);
if (!(d.data.domains ?? []).length) console.log('  (no domains added)');

console.log('\n== Recent delivery events' + (recipient ? ` for ${recipient}` : '') + ' ==');
const ev = await get(`/smtp/statistics/events?limit=15&days=2&sort=desc${recipient ? `&email=${encodeURIComponent(recipient)}` : ''}`);
if (ev.status !== 200) console.log(`  could not read events (HTTP ${ev.status}): ${JSON.stringify(ev.data).slice(0, 200)}`);
for (const e of ev.data.events ?? []) console.log(`  ${e.date}  ${String(e.event).padEnd(12)} to ${e.email}  "${e.subject ?? ''}"${e.reason ? `\n      REASON: ${e.reason}` : ''}`);
if (ev.status === 200 && !(ev.data.events ?? []).length) console.log('  (no events found)');
