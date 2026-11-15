/**
 * SMTP check - verifies the mail settings the API will use and optionally
 * sends a test email. Reads the same SMTP_* variables as the API, so what
 * passes here will work on Railway.
 *
 * Usage (PowerShell; the password stays in your shell, never in the repo):
 *   $env:SMTP_HOST="smtp.hostinger.com"; $env:SMTP_PORT="465"; $env:SMTP_SECURE="true"
 *   $env:SMTP_USER="michael@support.libericom.tech"; $env:SMTP_PASS="<password>"
 *   node scripts/smtp-check.mjs you@example.com     # last argument = where to send the test
 *
 * Omit the address to only verify the connection and login.
 */
import nodemailer from 'nodemailer';

const env = process.env;
const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(2);
}

const port = Number(env.SMTP_PORT ?? 587);
const secure = env.SMTP_SECURE === 'true';
const from = env.SMTP_FROM ?? env.SMTP_USER;
console.log(`Host ${env.SMTP_HOST}:${port}  secure=${secure}  user=${env.SMTP_USER}`);
console.log(`From address: ${from}`);
if (port === 465 && !secure) console.warn('Warning: port 465 needs SMTP_SECURE=true');
if (port === 587 && secure) console.warn('Warning: port 587 needs SMTP_SECURE=false (STARTTLS)');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST, port, secure,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  connectionTimeout: 15000, greetingTimeout: 15000,
});

try {
  await transporter.verify();
  console.log('OK  connected and logged in');
} catch (err) {
  console.error(`FAIL  ${err.code ?? ''} ${err.message}`);
  if (err.responseCode === 535) console.error('Hint: wrong mailbox password (535). Use the mailbox password from hPanel, not the hosting login.');
  process.exit(1);
}

const to = process.argv[2];
if (to) {
  try {
    const info = await transporter.sendMail({
      from, to,
      subject: 'VoteMax SMTP test',
      text: 'If you can read this, VoteMax can send invitations and verification codes from this mailbox.',
    });
    console.log(`OK  test email accepted for ${to} (${info.messageId}). Check the inbox AND the spam folder.`);
  } catch (err) {
    console.error(`FAIL sending: ${err.code ?? ''} ${err.message}`);
    if (/from|sender|not owned|authenticat/i.test(err.message)) console.error('Hint: SMTP_FROM must be the mailbox you log in with.');
    process.exit(1);
  }
}
