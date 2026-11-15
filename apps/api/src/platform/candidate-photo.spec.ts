import { beforeEach, describe, expect, it } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let ownerId: string;
let electionId: string;
let candidateId: string;

const pad = (n: number) => Buffer.alloc(n, 7);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad(300)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad(300)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBP', 'latin1'), pad(300)]);
const b64 = (b: Buffer) => b.toString('base64');

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Photo Org', 'photo-org')).id;
  ownerId = (await svc.createUser(orgId, 'owner@photo.org', 'Owner', 'pw-long-enough')).id;
  const election = await svc.createElection(ownerId, orgId, { name: 'Photo Election' });
  electionId = election.id;
  const position = await svc.addPosition(ownerId, electionId, 'President', 1, 1);
  candidateId = (await svc.addCandidate(ownerId, electionId, position.id, 'Ada Kamara')).id;
});

describe('candidate photos', () => {
  it('stores JPEG, PNG and WebP (as data URLs or raw base64) and serves the exact bytes', async () => {
    for (const [img, mime] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
      const { photoUrl } = await svc.setCandidatePhoto(ownerId, electionId, candidateId, `data:${mime};base64,${b64(img)}`);
      expect(photoUrl).toMatch(new RegExp(`^/candidates/${candidateId}/photo\\?v=[0-9a-f]{12}$`));
      const served = await svc.candidatePhoto(candidateId);
      expect(served.mime).toBe(mime);
      expect(served.bytes.equals(img)).toBe(true);
    }
    // Raw base64 with line breaks works too.
    await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG).replace(/(.{40})/g, '$1\n'))).resolves.toBeTruthy();
  });

  it('decides the type from the bytes, not from what the client claims', async () => {
    await svc.setCandidatePhoto(ownerId, electionId, candidateId, `data:image/png;base64,${b64(JPEG)}`);
    expect((await svc.candidatePhoto(candidateId)).mime).toBe('image/jpeg');
  });

  it('rejects SVG, GIF, text, empty, unreadable and oversized uploads', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), pad(100)]);
    for (const bad of [svg, gif, Buffer.from('just some text'), pad(50)]) {
      await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(bad))).rejects.toThrow(/JPEG, PNG or WebP/);
    }
    await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, '')).rejects.toThrow(/could not be read/);
    await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, '***not base64***')).rejects.toThrow(/could not be read/);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), pad(400_001)]);
    await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(big))).rejects.toThrow(/too large/);
    expect(await svc.candidatePhoto(candidateId).catch(() => 'none')).toBe('none');
  });

  it('exposes a versioned photo URL on candidates, ballots and the election detail; same bytes keep the same URL', async () => {
    const a = await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG));
    const again = await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG));
    expect(again.photoUrl).toBe(a.photoUrl);
    const changed = await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(PNG));
    expect(changed.photoUrl).not.toBe(a.photoUrl);
    const detail = await svc.electionDetail(electionId);
    expect(detail.positions[0].candidates[0].photoUrl).toBe(changed.photoUrl);
    // Detail/list objects never carry the image bytes.
    expect(JSON.stringify(detail)).not.toContain(b64(PNG).slice(0, 40));
  });

  it('can be removed, and goes away with the candidate', async () => {
    await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG));
    await svc.removeCandidatePhoto(ownerId, electionId, candidateId);
    expect((await store.getCandidate(candidateId))!.photoUrl).toBeNull();
    await expect(svc.candidatePhoto(candidateId)).rejects.toThrow(/NOT_FOUND/);

    await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG));
    await svc.removeCandidate(ownerId, electionId, candidateId);
    expect(store.candidatePhotos.size).toBe(0);
  });

  it('only changes while the ballot is editable, and only for that election\'s candidates', async () => {
    const other = await svc.createElection(ownerId, orgId, { name: 'Other' });
    await expect(svc.setCandidatePhoto(ownerId, other.id, candidateId, b64(JPEG))).rejects.toThrow(/NOT_FOUND/);
    await store.updateElection(electionId, { state: 'REGISTER_FROZEN' });
    await expect(svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG))).rejects.toThrow(/CONFIG_FROZEN/);
    await expect(svc.removeCandidatePhoto(ownerId, electionId, candidateId)).rejects.toThrow(/CONFIG_FROZEN/);
  });

  it('audits the change without storing any image data', async () => {
    await svc.setCandidatePhoto(ownerId, electionId, candidateId, b64(JPEG));
    const rec = (await store.listAudit(orgId)).find((a) => a.action === 'candidate.photo')!;
    expect(rec.outcome).toBe('success:set');
    expect(JSON.stringify(rec)).not.toContain(b64(JPEG).slice(0, 20));
  });
});
