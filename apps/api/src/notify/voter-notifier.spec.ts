import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderVoterSms, VoterNotifier } from './voter-notifier';

const ctx = {
  organizationName: 'Acme', electionName: 'Board 2026', memberId: 'VM-ABCD2345',
  link: 'https://vote.example/vote?org=acme&election=e1&id=VM-ABCD2345',
  votingOpensAt: null, votingClosesAt: null,
};
const msg = { subject: 's', text: 'full email body', sms: renderVoterSms('invite', ctx) };

afterEach(() => vi.unstubAllGlobals());

describe('voter SMS text', () => {
  it('contains the member ID, the personal link and a never-share warning', () => {
    const sms = renderVoterSms('invite', ctx);
    expect(sms).toContain('VM-ABCD2345');
    expect(sms).toContain('&id=VM-ABCD2345');
    expect(sms).toMatch(/never share/i);
  });
});

describe('VoterNotifier delivery', () => {
  it('sends phone-only voters through the SMS webhook', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const n = new VoterNotifier({ NODE_ENV: 'production', SMS_WEBHOOK_URL: 'https://sms.example/send' } as NodeJS.ProcessEnv);
    await expect(n.send({ ...msg, phone: '+231 88 000 0002' })).resolves.toBe('sms');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://sms.example/send');
    expect(JSON.parse(init.body)).toEqual({ to: '+231 88 000 0002', message: msg.sms });
  });

  it('fails closed in production when no provider can reach the voter', async () => {
    const n = new VoterNotifier({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    await expect(n.send({ ...msg, email: 'a@example.org' })).rejects.toThrow(/INVITE_UNDELIVERABLE/);
    await expect(n.send({ ...msg, phone: '+231 88 000 0002' })).rejects.toThrow(/INVITE_UNDELIVERABLE/);
  });

  it('falls through to the next SMS provider and then reports failure when all fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    const n = new VoterNotifier({ NODE_ENV: 'production', SMS_WEBHOOK_URL: 'https://sms.example/send' } as NodeJS.ProcessEnv);
    await expect(n.send({ ...msg, phone: '+231 88 000 0002' })).rejects.toThrow(/INVITE_UNDELIVERABLE/);
  });

  it('records to the dev outbox outside production', async () => {
    const n = new VoterNotifier({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    await expect(n.send({ ...msg, phone: '+231 88 000 0002' })).resolves.toBe('dev');
    expect(n.outbox[0]).toMatchObject({ to: '+231 88 000 0002', channel: 'sms' });
  });
});
