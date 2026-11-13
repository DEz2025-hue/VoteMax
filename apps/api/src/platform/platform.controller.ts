import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import type { Role } from '../auth/roles';
import type { ElectionState } from '../elections/lifecycle';
import {
  Public,
  RequireCapability,
  RequireTransitionCapability,
  SessionGuard,
  CapabilityGuard,
  type Principal,
} from '../auth/session.guard';
import { UseGuards } from '@nestjs/common';

export function guard<T>(fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve()
    .then(fn)
    .catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : 'Request failed');
    });
}

// Actor identity comes ONLY from the authenticated session principal
// (F-03). The x-actor-id header is no longer read anywhere. During first-run
// bootstrap (no roles assigned yet) the guard admits anonymous calls; those
// are audited under the literal actor id 'bootstrap'.
export function actor(req: { principal?: Principal }): string {
  return req.principal?.userId ?? 'bootstrap';
}

@UseGuards(SessionGuard, CapabilityGuard)
@Controller()
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  // @Public so the CapabilityGuard can admit first-run bootstrap calls;
  // non-bootstrap calls still require a session + capability.
  @Post('organizations')
  @Public()
  @RequireCapability('organization.create')
  createOrganization(@Req() req: { principal?: Principal }, @Body() body: {
    name: string; slug: string;
    admin?: { email: string; displayName: string; password: string; role?: Role };
  }) {
    return guard(() => this.platform.createOrganization(actor(req), body.name, body.slug, body.admin));
  }

  @Post('users')
  @Public()
  @RequireCapability('roles.assign')
  createUser(@Req() req: { principal?: Principal }, @Body() body: { organizationId: string | null; email: string; displayName: string; password: string }) {
    return guard(() => this.platform.createUser(body.organizationId, body.email, body.displayName, body.password));
  }

  @Post('roles')
  @Public()
  @RequireCapability('roles.assign')
  assignRole(@Req() req: { principal?: Principal }, @Body() body: { organizationId: string; userId: string; role: Role; electionId?: string | null; stationId?: string | null }) {
    return guard(() => this.platform.assignRole(actor(req), body.organizationId, body.userId, body.role, body.electionId ?? null, body.stationId ?? null));
  }

  @Get('users')
  @RequireCapability('roles.assign')
  users(@Req() req: { principal?: Principal }) {
    // Org comes from the authenticated principal, never from the query.
    const orgId = req.principal?.organizationId;
    if (!orgId) throw new ForbiddenException('TENANT_REQUIRED: no organization on principal');
    return guard(() => this.platform.listUsers(orgId));
  }

  @Post('elections')
  @RequireCapability('election.configure')
  createElection(@Req() req: { principal?: Principal }, @Body() body: {
    organizationId: string; name: string; description?: string; votingOpensAt?: string; votingClosesAt?: string; ballotOrderPolicy?: string;
  }) {
    return guard(() => this.platform.createElection(actor(req), body.organizationId, body));
  }

  @Get('elections')
  @RequireCapability('election.configure', 'register.manage', 'participation.viewAggregate', 'audit.read')
  elections(@Req() req: { principal?: Principal }) {
    // Org comes from the authenticated principal, never from the query.
    const orgId = req.principal?.organizationId;
    if (!orgId) throw new ForbiddenException('TENANT_REQUIRED: no organization on principal');
    return guard(() => this.platform.listOrgElections(orgId));
  }

  @Get('elections/:id')
  @RequireCapability('election.configure', 'register.manage', 'participation.viewAggregate', 'audit.read')
  electionDetail(@Param('id') id: string) {
    return guard(() => this.platform.electionDetail(id));
  }

  @Post('elections/:id/positions')
  @RequireCapability('election.configure')
  addPosition(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { title: string; seats?: number; maxChoices?: number }) {
    return guard(() => this.platform.addPosition(actor(req), id, body.title, body.seats ?? 1, body.maxChoices ?? 1));
  }

  @Post('elections/:id/candidates')
  @RequireCapability('candidates.manage')
  addCandidate(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { positionId: string; fullName: string; statement?: string }) {
    return guard(() => this.platform.addCandidate(actor(req), id, body.positionId, body.fullName, body.statement));
  }

  @Post('elections/:id/transition')
  @RequireTransitionCapability()
  transition(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { to: ElectionState }) {
    return guard(() => this.platform.transition(actor(req), id, body.to));
  }

  @Post('elections/:id/register/import')
  @RequireCapability('register.manage')
  importRegister(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { csv: string }) {
    return guard(() => this.platform.importRegister(actor(req), id, body.csv ?? ''));
  }

  @Post('elections/:id/register/resolve')
  @RequireCapability('register.manage')
  resolveDuplicate(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { voterId: string; decision: 'eligible' | 'ineligible' }) {
    return guard(() => this.platform.resolveDuplicate(actor(req), id, body.voterId, body.decision));
  }

  @Post('elections/:id/register/freeze')
  @RequireCapability('register.freeze')
  freezeRegister(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.freezeRegister(actor(req), id));
  }

  @Get('elections/:id/register/stats')
  @RequireCapability('register.manage', 'participation.viewAggregate')
  registerStats(@Param('id') id: string) {
    return guard(() => this.platform.registerStats(id));
  }

  @Get('elections/:id/register/voters')
  @RequireCapability('register.manage')
  registerVoters(@Param('id') id: string) {
    return guard(() => this.platform.listVoters(id));
  }

  // ---- Phase 3: voting & results ----

  // Public voter discovery: organization slug → voter-visible elections.
  // Returns only post-registration states and minimal public fields.
  @Get('organizations/:slug/elections')
  @Public()
  publicElections(@Param('slug') slug: string) {
    return guard(() => this.platform.publicElections(slug));
  }

  @Post('elections/:id/stations')
  @RequireCapability('election.configure')
  createStation(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { name: string }) {
    return guard(() => this.platform.createStation(actor(req), id, body.name));
  }

  @Get('elections/:id/stations')
  @RequireCapability('election.configure', 'station.runSession')
  stations(@Param('id') id: string) {
    return guard(() => this.platform.listStationsForElection(id));
  }

  @Post('elections/:id/voting/otp/request')
  @Public()
  requestOtp(@Param('id') id: string, @Body() body: { studentId: string }) {
    return guard(() => this.platform.requestOtp(id, body.studentId));
  }

  @Post('elections/:id/voting/otp/verify')
  @Public()
  verifyOtp(@Param('id') id: string, @Body() body: { studentId: string; code: string }) {
    return guard(() => this.platform.verifyOtp(id, body.studentId, body.code));
  }

  @Post('elections/:id/stations/:stationId/session')
  @RequireCapability('station.runSession')
  assistedSession(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('stationId') stationId: string, @Body() body: { officerUserId: string; studentId: string }) {
    // The officer identity asserted in the body must be the session user —
    // an officer cannot open sessions in another officer's name.
    if (body.officerUserId !== actor(req)) {
      throw new BadRequestException('FORBIDDEN: officerUserId must match the authenticated session');
    }
    return guard(() => this.platform.startAssistedSession(body.officerUserId, stationId, id, body.studentId));
  }

  @Post('voting/ballot')
  @Public()
  ballot(@Body() body: { ballotSession: string }) {
    return guard(() => this.platform.ballotForSession(body.ballotSession));
  }

  @Post('voting/submit')
  @Public()
  submit(@Body() body: { ballotSession: string; selections: Record<string, string[]>; idempotencyKey: string }) {
    return guard(() => this.platform.submitBallot(body.ballotSession, body.selections ?? {}, body.idempotencyKey ?? randomUUID()));
  }

  @Get('elections/:id/voting/status')
  @Public()
  votingStatus(@Param('id') id: string, @Query('ballotSession') ballotSession?: string) {
    if (!ballotSession) throw new BadRequestException('ballotSession query parameter is required');
    return guard(() => this.platform.submissionStatusForSession(id, ballotSession));
  }

  @Get('elections/:id/participation')
  @RequireCapability('participation.viewAggregate')
  participation(@Param('id') id: string) {
    return guard(() => this.platform.participation(id));
  }

  @Post('elections/:id/close')
  @RequireCapability('election.openClose')
  close(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.closeElection(actor(req), id));
  }

  @Post('elections/:id/tally')
  @RequireCapability('tally.execute')
  tally(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { authorizedBy: string; approvers: string[] }) {
    return guard(() => this.platform.tally(actor(req), id, body));
  }

  @Post('elections/:id/tally/verify')
  @RequireCapability('tally.verify')
  verifyTally(@Param('id') id: string) {
    return guard(() => this.platform.verifyTally(id));
  }

  @Post('elections/:id/tally/recount')
  @RequireCapability('tally.execute')
  recount(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { authorizedBy: string; approvers: string[] }) {
    return guard(() => this.platform.recount(actor(req), id, body));
  }

  @Post('elections/:id/certify')
  @RequireCapability('results.certify')
  certify(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { certifiedBy: string; secondApprover: string }) {
    // certifiedBy must be the session user; secondApprover is the co-signer.
    if (body.certifiedBy !== actor(req)) {
      throw new BadRequestException('FORBIDDEN: certifiedBy must match the authenticated session');
    }
    return guard(() => this.platform.certify(actor(req), id, body));
  }

  @Post('elections/:id/publish')
  @RequireCapability('results.publish')
  publish(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.publish(actor(req), id));
  }

  @Get('elections/:id/report')
  @RequireCapability('participation.viewAggregate', 'results.publish', 'results.certify', 'audit.read')
  report(@Param('id') id: string) {
    return guard(() => this.platform.report(id));
  }

  @Get('audit')
  @RequireCapability('audit.read')
  audit(@Req() req: { principal?: Principal }, @Query('organizationId') organizationId?: string) {
    return guard(async () => {
      const principal = req.principal;
      const isPlatformAdmin = principal?.assignments.some((a) => a.role === 'platform_admin') ?? false;
      let organization = organizationId;
      if (!isPlatformAdmin) {
        const own = principal?.organizationId;
        if (!own) throw new ForbiddenException('TENANT_REQUIRED: no organization on principal');
        if (organization && organization !== own) {
          throw new ForbiddenException('FORBIDDEN: cannot read another organization audit log');
        }
        organization = own;
      }
      return {
        verified: await this.platform.verifyAuditChain(),
        records: await this.platform.auditEntries(organization),
      };
    });
  }

  // ---- anti-fraud review (SEC-VOT-10) ----
  // Events/blocks expose salted hashes and rule names only — no raw IPs,
  // device fingerprints, or voter identifiers.

  @Get('elections/:id/fraud/events')
  @RequireCapability('fraud.read')
  fraudEvents(@Param('id') id: string) {
    return guard(() => this.platform.listFraudEvents(id));
  }

  @Get('fraud/blocks')
  @RequireCapability('fraud.read')
  fraudBlocks() {
    return guard(() => this.platform.listFraudBlocks());
  }

  @Post('fraud/blocks/:id/lift')
  @RequireCapability('fraud.manage')
  liftFraudBlock(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.liftFraudBlock(actor(req), id));
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly platform: PlatformService) {}

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string; totp?: string }) {
    return guard(() => this.platform.login(body.email, body.password, body.totp));
  }

  /** Resolve the caller's session to a principal — lets clients validate a stored token. */
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: { principal?: Principal }) {
    return req.principal ?? null;
  }

  /**
   * Revoke the bearer session server-side. Public so logout still succeeds
   * for expired/invalid tokens; revocation of an unknown hash is a no-op.
   */
  @Public()
  @Post('logout')
  logout(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    const header = req.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) return guard(() => this.platform.logout(token));
    return { ok: true };
  }
}
