import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpEmailSender, parseFromAddress } from './email-api';
import { VoterNotifier } from '../notify/voter-notifier';
import { OtpDelivery } from '../otp/otp-delivery';

type Call = [string, { method: string; headers: Record<string, string>; body: string }];

function stubFetch(handler: (url: string) => { ok: boolean; status: number; text?: string }) {
  const fn = vi.fn(async (url: string) => {
    const r = handler(url);
    return { ok: r.ok, status: r.status, text: async () => r.text ?? '', json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const env = (provider: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production', EMAIL_PROVIDER: provider, EMAIL_API_KEY: 'key-123',
  EMAIL_FROM: 'PGA <elections@example.org>', ...extra,
} as NodeJS.ProcessEnv);

const msg = { to: 'voter@example.com', subject: 'Hi', text: 'Body' };

afterEach(() => vi.unstubAllGlobals());

describe('parseFromAddress', () => {
  it('splits name and address, or accepts a bare address', () => {
    expect(parseFromAddress('PGA <elections@example.org>')).toEqual({ name: 'PGA', email: 'elections@example.org' });
    expect(parseFromAddress('"Vote Max" <a@b.co>')).toEqual({ name: 'Vote Max', email: 'a@b.co' });
    expect(parseFromAddress('a@b.co')).toEqual({ email: 'a@b.co' });
  });
});

describe('HttpEmailSender configuration', () => {
  it('needs a known provider, a key and a sender address', () => {
    expect(new HttpEmailSender(env('brevo')).configured).toBe(true);
    expect(new HttpEmailSender(env('mailgun')).configured).toBe(false);
    expect(new HttpEmailSender(env('brevo', { EMAIL_API_KEY: '' })).configured).toBe(false);
    expect(new HttpEmailSender(env('brevo', { EMAIL_FROM: '' })).configured).toBe(false);
    expect(new HttpEmailSender({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).configured).toBe(false);
  });
});

describe('provider requests', () => {
  it('Brevo: api-key header and sender/to/textContent body', async () => {
    const f = stubFetch(() => ({ ok: true, status: 201 }));
    await new HttpEmailSender(env('brevo')).send(msg);
    const [url, init] = f.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('key-123');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'PGA', email: 'elections@example.org' }, to: [{ email: 'voter@example.com' }],
      subject: 'Hi', textContent: 'Body',
    });
  });

  it('Resend: bearer auth and a "Name <addr>" from', async () => {
    const f = stubFetch(() => ({ ok: true, status: 200 }));
    await new HttpEmailSender(env('resend')).send(msg);
    const [url, init] = f.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer key-123');
    expect(JSON.parse(init.body)).toEqual({ from: 'PGA <elections@example.org>', to: ['voter@example.com'], subject: 'Hi', text: 'Body' });
  });

  it('SendGrid: bearer auth and personalizations body', async () => {
    const f = stubFetch(() => ({ ok: true, status: 202 }));
    await new HttpEmailSender(env('sendgrid')).send(msg);
    const [url, init] = f.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.headers.authorization).toBe('Bearer key-123');
    expect(JSON.parse(init.body)).toEqual({
      personalizations: [{ to: [{ email: 'voter@example.com' }] }], from: { email: 'elections@example.org', name: 'PGA' },
      subject: 'Hi', content: [{ type: 'text/plain', value: 'Body' }],
    });
  });

  it('reports the provider\'s reason on failure without leaking the API key', async () => {
    stubFetch(() => ({ ok: false, status: 403, text: '{"message":"Sender not verified"}' }));
    const err = await new HttpEmailSender(env('resend')).send(msg).catch((e: Error) => e);
    expect((err as Error).message).toBe('resend email API 403: {"message":"Sender not verified"}');
    expect((err as Error).message).not.toContain('key-123');
  });
});

describe('delivery order', () => {
  it('invitations use the email API first', async () => {
    const f = stubFetch(() => ({ ok: true, status: 201 }));
    const n = new VoterNotifier(env('brevo'));
    await expect(n.send({ email: 'v@example.com', subject: 's', text: 't', sms: 'x' })).resolves.toBe('email');
    expect(f).toHaveBeenCalledTimes(1);
    expect(n.configured).toBe(true);
  });

  it('falls back to SMS when the email API fails and the voter has a phone', async () => {
    const f = stubFetch((url) => url.includes('brevo') ? { ok: false, status: 500 } : { ok: true, status: 200 });
    const n = new VoterNotifier(env('brevo', { SMS_WEBHOOK_URL: 'https://sms.example/send' }));
    await expect(n.send({ email: 'v@example.com', phone: '+231 88 000 0002', subject: 's', text: 't', sms: 'x' })).resolves.toBe('sms');
    expect(f.mock.calls.map((c) => (c as unknown as Call)[0])).toEqual(['https://api.brevo.com/v3/smtp/email', 'https://sms.example/send']);
    expect(n.lastError?.message).toMatch(/brevo email API 500/);
  });

  it('fails closed in production when the email API fails and there is no other channel', async () => {
    stubFetch(() => ({ ok: false, status: 401, text: 'bad key' }));
    const n = new VoterNotifier(env('sendgrid'));
    await expect(n.send({ email: 'v@example.com', subject: 's', text: 't', sms: 'x' })).rejects.toThrow(/INVITE_UNDELIVERABLE/);
    expect(n.lastError?.message).toContain('sendgrid email API 401');
  });

  it('one-time codes use the email API and health reports the provider', async () => {
    const f = stubFetch(() => ({ ok: true, status: 200 }));
    const d = new OtpDelivery(env('resend'));
    expect(d.describe()).toMatchObject({ email: true, emailVia: 'resend', devAllowed: false });
    await expect(d.deliver({ electionId: 'e', memberId: 'm', code: '123456', email: 'v@example.com' })).resolves.toBe('email');
    const [, init] = f.mock.calls[0] as unknown as Call;
    expect(JSON.parse(init.body).text).toContain('123456');
  });

  it('describe() says smtp when only SMTP is configured and none when nothing is', () => {
    expect(new OtpDelivery({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' } as NodeJS.ProcessEnv).describe().emailVia).toBe('smtp');
    expect(new OtpDelivery({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).describe().emailVia).toBeNull();
  });
});
