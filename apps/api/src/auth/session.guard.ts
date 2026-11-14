import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasCapability, type Capability, type CapabilityScope, type RoleAssignment } from './roles';
import { PlatformService } from '../platform/platform.service';

export const PUBLIC_KEY = 'votemax:public';
export const CAPABILITY_KEY = 'votemax:capabilities';
export const TRANSITION_CAPABILITY_KEY = 'votemax:transition-capability';

/** Marks a route as reachable without a session (login, voter-facing flows). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Any-of capability check; org is resolved from the request context. */
export const RequireCapability = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITY_KEY, capabilities);

/**
 * Lifecycle transitions need a capability derived from the target state
 * (e.g. READY needs election.readiness.approve, OPEN needs election.openClose).
 */
export const RequireTransitionCapability = () => SetMetadata(TRANSITION_CAPABILITY_KEY, true);

const TRANSITION_CAPABILITIES: Record<string, Capability> = {
  CONFIGURED: 'election.configure',
  REGISTRATION: 'election.configure',
  READY: 'election.readiness.approve',
  OPEN: 'election.openClose',
  SUSPENDED: 'election.openClose',
  CLOSED: 'election.openClose',
  CANCELLED: 'election.openClose',
  TALLIED: 'election.openClose',
  VERIFIED: 'election.openClose',
  RECOUNT: 'election.openClose',
  CERTIFIED: 'election.openClose',
  PUBLISHED: 'election.openClose',
  ARCHIVED: 'election.openClose',
};

export function transitionCapability(to: unknown): Capability {
  return (typeof to === 'string' && TRANSITION_CAPABILITIES[to]) || 'election.openClose';
}

// Capabilities that are platform-scoped rather than tenant-scoped.
const PLATFORM_SCOPED_CAPABILITIES = new Set<Capability>([
  'organization.create',
  'platform.tenants.read',
  'platform.tenants.provision',
  'platform.health.read',
  'fraud.read',
  'fraud.manage',
  'audit.read',
]);

export interface Principal {
  userId: string;
  organizationId: string | null;
  assignments: (RoleAssignment & { userId: string })[];
}

/**
 * Session guard (F-03): every non-public endpoint requires a valid bearer
 * session token. The `x-actor-id` header is no longer trusted anywhere.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platform: PlatformService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      principal?: Principal;
    }>();

    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;

    // Public routes may still carry a session (e.g. bootstrap-eligible
    // endpoints that require auth once bootstrap closes). Resolve it
    // opportunistically so CapabilityGuard can see the principal.
    if (isPublic) {
      if (token) {
        const principal = await this.platform.principalForToken(token);
        if (principal) request.principal = principal;
      }
      return true;
    }

    if (!token) throw new UnauthorizedException('AUTH_REQUIRED: session token missing');
    const principal = await this.platform.principalForToken(token);
    if (!principal) throw new UnauthorizedException('AUTH_REQUIRED: invalid or expired session');
    request.principal = principal;
    return true;
  }
}

/**
 * Capability guard (F-05 / FR-IAM-002): routes decorated with
 * @RequireCapability must be called by a principal holding at least one of
 * the listed capabilities within the target organization. First-run
 * bootstrap (zero users) may create the first organization anonymously.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platform: PlatformService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    let capabilities = this.reflector.getAllAndOverride<Capability[]>(CAPABILITY_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    const isTransition = this.reflector.getAllAndOverride<boolean>(TRANSITION_CAPABILITY_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isTransition) {
      const to = (context.switchToHttp().getRequest<{ body?: { to?: unknown } }>().body)?.to;
      capabilities = [transitionCapability(to)];
    }
    if (!capabilities || capabilities.length === 0) return true;

    const request = context.switchToHttp().getRequest<{
      principal?: Principal;
      params: Record<string, string>;
      body: Record<string, unknown>;
    }>();

    // First-run bootstrap: before any user account exists, the initial
    // organization and the first user/role assignments may be created
    // anonymously. Once the first user exists this path closes; all
    // subsequent calls require a session with the capability.
    if (await this.platform.isBootstrap() &&
        capabilities.some((c) => c === 'organization.create' || c === 'roles.assign')) {
      return true;
    }

    const principal = request.principal;
    if (!principal) throw new UnauthorizedException('AUTH_REQUIRED: session token missing');

    const isPlatformAdmin = principal.assignments.some((a) => a.role === 'platform_admin');
    // Platform-scoped capabilities do not require an existing tenant. For
    // audit.read the controller still enforces which organization is read.
    if (isPlatformAdmin && capabilities.every((cap) => PLATFORM_SCOPED_CAPABILITIES.has(cap))) {
      return true;
    }

    const scope = await this.resolveScope(request);
    if (!scope.organizationId) throw new ForbiddenException('TENANT_REQUIRED: could not resolve organization');

    // Least privilege: an assignment scoped to another election
    // must not satisfy a capability for this one.
    const capabilityScope: CapabilityScope = {
      electionId: scope.electionId,
    };
    const allowed = capabilities.some((cap) =>
      hasCapability(principal.assignments, cap, scope.organizationId as string, capabilityScope),
    );
    if (!allowed) {
      throw new ForbiddenException(`FORBIDDEN: requires one of [${capabilities.join(', ')}] in this organization`);
    }
    return true;
  }

  private async resolveScope(request: {
    principal?: Principal;
    params: Record<string, string>;
    body: Record<string, unknown>;
  }): Promise<{ organizationId: string | null; electionId: string | null }> {
    // Election-scoped routes: tenant and election scope come from the stored
    // election, never from client input (SEC-TEN-01).
    let organizationId: string | null = null;
    let electionId: string | null = null;
    const routeId = request.params['id'];
    if (routeId) {
      const election = await this.platform.store.getElection(routeId);
      if (election) {
        organizationId = election.organizationId;
        electionId = election.id;
      }
    }
    if (!organizationId) {
      const bodyOrg = request.body?.['organizationId'];
      if (typeof bodyOrg === 'string' && bodyOrg.length > 0) organizationId = bodyOrg;
    }
    if (!organizationId) organizationId = request.principal?.organizationId ?? null;
    return { organizationId, electionId };
  }
}
