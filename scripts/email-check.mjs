/**
 * Email API check - sends one test email through Brevo, Resend or SendGrid
 * using the same EMAIL_* variables as the API, and prints the provider's real
 * answer. What works here will work on Railway.
 *
 * Usage (PowerShell; your key stays in your shell, never in the repo):
 *   $env:EMAIL_PROVIDER="brevo"        # or resend | sendgrid
 *   $env:EMAIL_API_KEY="<api key>"
 *   $env:EMAIL_FROM="PGA <elections@your-domain>"   # must be a verified sender
 *   node scripts/email-check.mjs someone@real-address.com
 */
const env = process.env;
const provider = (env.EMAIL_PROVIDER ?? '').toLowerCase();
const key = env.EMAIL_API_KEY ?? '';
const fromRaw = env.EMAIL_FROM ?? '';
const to = process.argv[2];

if (!['brevo', 'resend', 'sendgrid'].includes(provider) || !key || !fromRaw || !to) {
  console.error('Need EMAIL_PROVIDER (brevo|resend|sendgrid), EMAIL_API_KEY, EMAIL_FROM and a recipient argument.');
  process.exit(2);
}

const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(fromRaw);
const from = m ? { name: m[1]?.trim() || undefined, email: m[2].trim() } : { email: fromRaw.trim() };
const subject = 'PGA email test';
const text = 'If you can read this, PGA can send invitations and verification codes through this provider.';

const requests = {
  brevo: ['https://api.brevo.com/v3/smtp/email', { 'api-key': key }, { sender: from, to: [{ email: to }], subject, textContent: text }],
  resend: ['https://api.resend.com/emails', { authorization: `Bearer ${key}` }, { from: from.name ? `${from.name} <${from.email}>` : from.email, to: [to], subject, text }],
  sendgrid: ['https://api.sendgrid.com/v3/mail/send', { authorization: `Bearer ${key}` }, { personalizations: [{ to: [{ email: to }] }], from, subject, content: [{ type: 'text/plain', value: text }] }],
};

const [url, headers, body] = requests[provider];
console.log(`Provider ${provider}, from ${from.email}, to ${to}`);
try {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const out = (await res.text()).slice(0, 400);
  if (res.ok) {
    console.log(`OK  ${provider} accepted the message (HTTP ${res.status}). Check the inbox AND the spam folder.`);
  } else {
    console.error(`FAIL  HTTP ${res.status}: ${out}`);
    if (/unrecogni[sz]ed IP/i.test(out)) {
      console.error('Hint: Brevo is blocking this IP address. In Brevo open Security -> Authorised IPs (https://app.brevo.com/security/authorised_ips)');
      console.error('      and deactivate blocking. Railway\'s IP changes, so adding only your own IP would not fix the live app.');
    } else if (res.status === 401 || res.status === 403) {
      console.error('Hint: wrong API key, or the sender address/domain is not verified with the provider.');
    }
    process.exit(1);
  }
} catch (err) {
  console.error(`FAIL  ${err.name}: ${err.message}`);
  process.exit(1);
}
