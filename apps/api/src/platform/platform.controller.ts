import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
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

function fraudScope(req: { principal?: Principal }): { platform: boolean; organizationId: string | null } {
  return {
    platform: req.principal?.assignments.some((a) => a.role === 'platform_admin') ?? false,
    organizationId: req.principal?.organizationId ?? null,
  };
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
  assignRole(@Req() req: { principal?: Principal }, @Body() body: { organizationId: string; userId: string; role: Role; electionId?: string | null }) {
    return guard(() => this.platform.assignRole(actor(req), body.organizationId, body.userId, body.role, body.electionId ?? null));
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
    voteType?: string; resultsMode?: string; announcement?: string; autoOpen?: boolean; autoClose?: boolean;
  }) {
    return guard(() => this.platform.createElection(actor(req), body.organizationId, body));
  }

  @Patch('elections/:id')
  @RequireCapability('election.configure')
  updateElection(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: {
    name?: string; description?: string; votingOpensAt?: string; votingClosesAt?: string;
    voteType?: string; resultsMode?: string; announcement?: string; autoOpen?: boolean; autoClose?: boolean;
  }) {
    return guard(() => this.platform.updateElectionDetails(actor(req), id, body));
  }

  // Automatic start/close switches and extending the closing time.
  @Patch('elections/:id/schedule')
  @RequireCapability('election.openClose')
  updateSchedule(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { autoOpen?: boolean; autoClose?: boolean; votingClosesAt?: string }) {
    return guard(() => this.platform.updateSchedule(actor(req), id, {
      autoOpen: body?.autoOpen, autoClose: body?.autoClose, votingClosesAt: body?.votingClosesAt,
    }));
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

  @Delete('elections/:id/positions/:positionId')
  @RequireCapability('election.configure')
  removePosition(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('positionId') positionId: string) {
    return guard(() => this.platform.removePosition(actor(req), id, positionId));
  }

  @Delete('elections/:id/candidates/:candidateId')
  @RequireCapability('candidates.manage')
  removeCandidate(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('candidateId') candidateId: string) {
    return guard(() => this.platform.removeCandidate(actor(req), id, candidateId));
  }

  @Put('elections/:id/candidates/:candidateId/photo')
  @RequireCapability('candidates.manage')
  setCandidatePhoto(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('candidateId') candidateId: string, @Body() body: { image: string }) {
    return guard(() => this.platform.setCandidatePhoto(actor(req), id, candidateId, body?.image));
  }

  @Delete('elections/:id/candidates/:candidateId/photo')
  @RequireCapability('candidates.manage')
  removeCandidatePhoto(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('candidateId') candidateId: string) {
    return guard(() => this.platform.removeCandidatePhoto(actor(req), id, candidateId));
  }

  // Public image for the ballot. The URL carries a content hash (?v=), so it can be cached
  // forever; a new photo gets a new URL.
  @Get('candidates/:candidateId/photo')
  @Public()
  candidatePhoto(@Param('candidateId') candidateId: string, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    return guard(async () => {
      const { mime, bytes } = await this.platform.candidatePhoto(candidateId);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Disposition', 'inline');
      return new StreamableFile(bytes, { type: mime });
    });
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

  @Patch('elections/:id/register/voters/:voterId')
  @RequireCapability('register.manage')
  updateVoter(
    @Req() req: { principal?: Principal }, @Param('id') id: string, @Param('voterId') voterId: string,
    @Body() body: { fullName?: string; email?: string; phone?: string },
  ) {
    return guard(() => this.platform.updateVoter(actor(req), id, voterId, {
      fullName: typeof body?.fullName === 'string' ? body.fullName : undefined,
      email: typeof body?.email === 'string' ? body.email : undefined,
      phone: typeof body?.phone === 'string' ? body.phone : undefined,
    }));
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

  // ---- Voter notifications ----

  @Post('elections/:id/notify')
  @RequireCapability('register.manage')
  notifyVoters(@Req() req: { principal?: Principal }, @Param('id') id: string, @Body() body: { kind?: string }) {
    const kind = body?.kind === 'reminder_open' || body?.kind === 'reminder_close' ? body.kind : 'invite';
    return guard(() => this.platform.notifyVoters(actor(req), id, kind));
  }

  @Get('elections/:id/notifications')
  @RequireCapability('register.manage', 'participation.viewAggregate', 'audit.read')
  listNotifications(@Param('id') id: string) {
    return guard(() => this.platform.listNotificationBatches(id));
  }

  // ---- Phase 3: voting & results ----

  // Public voter discovery: organization slug → voter-visible elections.
  // Returns only post-registration states and minimal public fields.
  @Get('organizations/:slug/elections')
  @Public()
  publicElections(@Param('slug') slug: string) {
    return guard(() => this.platform.publicElections(slug));
  }

  @Post('elections/:id/voting/otp/request')
  @Public()
  requestOtp(@Param('id') id: string, @Body() body: { memberId: string }) {
    // Uniform public shape (no channel) so responses cannot reveal whether
    // a member ID is on the register.
    return guard(async () => {
      const r = await this.platform.requestOtp(id, body.memberId);
      return r.devCode ? { sent: true, devCode: r.devCode } : { sent: true };
    });
  }

  @Post('elections/:id/voting/otp/verify')
  @Public()
  verifyOtp(@Param('id') id: string, @Body() body: { memberId: string; code: string }) {
    return guard(() => this.platform.verifyOtp(id, body.memberId, body.code));
  }

  /** Sign in with the personal voting link (member ID + secret key); no emailed code. */
  @Post('elections/:id/voting/link/enter')
  @Public()
  enterWithLink(@Param('id') id: string, @Body() body: { memberId: string; key: string }) {
    return guard(() => this.platform.enterWithLink(id, String(body.memberId ?? ''), String(body.key ?? '')));
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
  participation(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.participation(id, actor(req)));
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
  report(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.report(id, actor(req)));
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
  // Events/blocks expose salted hashes and rule names only - no raw IPs,
  // device fingerprints, or voter identifiers.

  @Get('elections/:id/fraud/events')
  @RequireCapability('fraud.read')
  fraudEvents(@Param('id') id: string) {
    return guard(() => this.platform.listFraudEvents(id));
  }

  @Get('fraud/blocks')
  @RequireCapability('fraud.read')
  fraudBlocks(@Req() req: { principal?: Principal }) {
    return guard(() => this.platform.listFraudBlocks(fraudScope(req)));
  }

  @Post('fraud/blocks/:id/lift')
  @RequireCapability('fraud.manage')
  liftFraudBlock(@Req() req: { principal?: Principal }, @Param('id') id: string) {
    return guard(() => this.platform.liftFraudBlock(actor(req), id, fraudScope(req)));
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

  /** Resolve the caller's session to a principal - lets clients validate a stored token. */
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
