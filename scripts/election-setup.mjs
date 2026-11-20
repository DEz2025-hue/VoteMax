/**
 * Shared helpers for the local load/failure scripts: an authenticated API
 * client (staff sign-in uses the emailed code, returned by non-production APIs). Admin endpoints require a session token + capability (F-03/F-05);
 * voter-facing endpoints are public.
 */
export async function apiPost(API, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function apiGet(API, path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Staff sign-in is two steps; against a non-production API the first step returns the emailed code. */
export async function login(API, email, password) {
  const step = await apiPost(API, '/auth/login', { email, password });
  if (!step.data.devCode) throw new Error(`login failed for ${email}: ${JSON.stringify(step.data)}`);
  const r = await apiPost(API, '/auth/login/verify', { email, code: step.data.devCode });
  if (!r.data.token) throw new Error(`login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

/**
 * Bootstrap a full pilot election through the API: organization, three
 * SoD-separated role holders (election admin, registrar, committee chair),
 * election configuration, register import + freeze, READY and OPEN.
 * Returns ids and session tokens for each role.
 */
export async function setupPilotElection(API, { orgName, slug, electionName, csv }) {
  const stamp = `${slug}-${Date.now().toString(36)}`;
  const org = (await apiPost(API, '/organizations', { name: orgName, slug: stamp })).data;
  if (!org.id) throw new Error(`organization creation failed: ${JSON.stringify(org)}`);

  const mkUser = async (email, name) =>
    (await apiPost(API, '/users', {
      organizationId: org.id, email, displayName: name, password: 'pw-long-enough',
    })).data;
  const admin = await mkUser(`admin-${stamp}@x.edu`, 'Election Admin');
  const registrar = await mkUser(`reg-${stamp}@x.edu`, 'Registrar');
  const chair = await mkUser(`chair-${stamp}@x.edu`, 'Committee Chair');

  // The first user becomes organization_owner during the bootstrap window
  // (the window closes after the first role exists). The owner then grants
  // itself election_admin through the normal roles.assign capability.
  const ro = await apiPost(API, '/roles', { organizationId: org.id, userId: admin.id, role: 'organization_owner' });
  if (ro.status >= 400) throw new Error(`owner role failed: ${JSON.stringify(ro.data)}`);
  const adminToken = await login(API, `admin-${stamp}@x.edu`, 'pw-long-enough', admin.totpSecret);
  const re = await apiPost(API, '/roles', { organizationId: org.id, userId: admin.id, role: 'election_admin' }, adminToken);
  if (re.status >= 400) throw new Error(`election_admin role failed: ${JSON.stringify(re.data)}`);

  const el = (await apiPost(API, '/elections', {
    organizationId: org.id, name: electionName,
    votingOpensAt: new Date(Date.now() - 3600_000).toISOString(),
    votingClosesAt: new Date(Date.now() + 3600_000).toISOString(),
  }, adminToken)).data;
  if (!el.id) throw new Error(`election creation failed: ${JSON.stringify(el)}`);

  // Bootstrap is closed now; role assignment goes through the owner's
  // roles.assign capability.
  const r1 = await apiPost(API, '/roles', { organizationId: org.id, userId: registrar.id, role: 'voter_registrar', electionId: el.id }, adminToken);
  const r2 = await apiPost(API, '/roles', { organizationId: org.id, userId: chair.id, role: 'committee_chair', electionId: el.id }, adminToken);
  if (r1.status >= 400 || r2.status >= 400) throw new Error(`role assignment failed: ${JSON.stringify([r1.data, r2.data])}`);
  const registrarToken = await login(API, `reg-${stamp}@x.edu`, 'pw-long-enough', registrar.totpSecret);
  const chairToken = await login(API, `chair-${stamp}@x.edu`, 'pw-long-enough', chair.totpSecret);

  const pos = (await apiPost(API, `/elections/${el.id}/positions`, { title: 'President', seats: 1, maxChoices: 1 }, adminToken)).data;
  const cand = (await apiPost(API, `/elections/${el.id}/candidates`, { positionId: pos.id, fullName: 'Ada' }, adminToken)).data;

  const must = async (label, p) => { if (p.status >= 400) throw new Error(`${label} failed: ${p.status} ${JSON.stringify(p.data)}`); };
  await must('CONFIGURED', await apiPost(API, `/elections/${el.id}/transition`, { to: 'CONFIGURED' }, adminToken));
  await must('REGISTRATION', await apiPost(API, `/elections/${el.id}/transition`, { to: 'REGISTRATION' }, adminToken));
  await must('register import', await apiPost(API, `/elections/${el.id}/register/import`, { csv }, registrarToken));
  await must('register freeze', await apiPost(API, `/elections/${el.id}/register/freeze`, {}, chairToken));
  await must('READY', await apiPost(API, `/elections/${el.id}/transition`, { to: 'READY' }, chairToken));
  await must('OPEN', await apiPost(API, `/elections/${el.id}/transition`, { to: 'OPEN' }, chairToken));

  return {
    orgId: org.id, electionId: el.id, positionId: pos.id, candidateId: cand.id,
    tokens: { admin: adminToken, registrar: registrarToken, chair: chairToken },
  };
}
