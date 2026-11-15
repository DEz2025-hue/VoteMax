import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FraudService, type FraudRequestContext } from './fraud.service';
import type { FraudSurface } from '../store/types';
import type { Principal } from '../auth/roles';

interface FraudRequest {
  method: string;
  path: string;
  originalUrl?: string;
  ip?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map method+path to a fraud surface. Order matters - first match wins. */
export function surfaceFor(method: string, path: string): FraudSurface {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  if (m === 'POST' && /\/auth\/login$/.test(p)) return 'login';
  if (m === 'POST' && /\/auth\/logout$/.test(p)) return 'logout';
  if (/\/voting\/otp\/request$/.test(p)) return 'otp_request';
  if (/\/voting\/otp\/verify$/.test(p)) return 'otp_verify';
  if (/\/voting\/submit$/.test(p)) return 'ballot_submit';
  if (/\/voting\/ballot$/.test(p)) return 'ballot_fetch';

  if (/\/register\/import$/.test(p)) return 'register_import';
  if (/\/platform\/organizations\/[^/]+\/provision$/.test(p)) return 'provision';
  if (m === 'POST' && /\/organizations$/.test(p)) return 'org_create';
  if (m === 'POST' && /\/users$/.test(p)) return 'user_create';
  if (m === 'POST' && /\/roles$/.test(p)) return 'role_assign';
  if (m === 'POST') return 'mutation';
  return 'read';
}

function header(req: FraudRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function clientIp(req: FraudRequest): string | undefined {
  const fwd = header(req, 'x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip;
}

/** Best available actor identifier - always hashed by FraudService. */
function deriveRef(req: FraudRequest): string | undefined {
  const b = req.body ?? {};
  const candidates = [
    b.memberId, b.email, b.officerUserId, b.userId, b.voterId,
    b.certifiedBy, b.authorizedBy, b.approvers && Array.isArray(b.approvers) ? b.approvers[0] : undefined,
    req.principal?.userId,
    typeof b.ballotSession === 'string' ? `bs:${b.ballotSession}` : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && c.length <= 320) return c;
  }
  const auth = header(req, 'authorization');
  if (auth?.startsWith('Bearer ')) return `tok:${auth.slice(7).trim()}`;
  return undefined;
}

function deriveElectionId(req: FraudRequest): string | null {
  // Only /elections/:id/* paths carry an election id; platform/org routes
  // reuse :id for other entities and must not be treated as elections.
  const p = (req.path ?? req.originalUrl ?? '').split('?')[0];
  if (!p.includes('/elections/')) return null;
  const id = req.params?.id;
  return id && UUID_RE.test(id) ? id : null;
}

function parseBehavior(raw: string | undefined): FraudRequestContext['behavior'] {
  if (!raw || raw.length > 512) return undefined;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      dwellMs: typeof v.dwellMs === 'number' ? v.dwellMs : undefined,
      interactions: typeof v.interactions === 'number' ? v.interactions : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Global anti-fraud gate (SEC-VOT-10). Runs after guards (principal is
 * resolved) and before every handler. Blocks/throttles reject with 403/429;
 * evaluation failures fail open inside FraudService.
 */
@Injectable()
export class FraudInterceptor implements NestInterceptor {
  constructor(private readonly fraud: FraudService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<FraudRequest>();
    // Candidate photos are static, cacheable GETs: no rule applies to them and
    // each ballot view loads several, so skip the (write-heavy) evaluation.
    if (req.method === 'GET' && /\/candidates\/[^/]+\/photo$/.test((req.path ?? req.originalUrl ?? '').split('?')[0])) {
      return next.handle();
    }
    const surface = surfaceFor(req.method, req.path ?? req.originalUrl ?? '');
    const deviceFp = header(req, 'x-device-fp');
    const decision = await this.fraud.evaluate({
      ip: clientIp(req),
      deviceFp: deviceFp && deviceFp.length <= 256 ? deviceFp : undefined,
      userAgent: header(req, 'user-agent'),
      behavior: parseBehavior(header(req, 'x-fraud-behavior')),
      ref: deriveRef(req),
      electionId: deriveElectionId(req),
      surface,
    });
    if (decision.action === 'block') {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'FRAUD_BLOCKED: this request was blocked by anti-fraud controls',
        reasons: decision.reasons,
      });
    }
    if (decision.action === 'throttle') {
      throw new HttpException(
        { statusCode: 429, message: 'FRAUD_THROTTLED: too many requests; please slow down', reasons: decision.reasons },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return next.handle();
  }
}
