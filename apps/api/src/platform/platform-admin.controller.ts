import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import {
  CapabilityGuard,
  RequireCapability,
  SessionGuard,
  type Principal,
} from '../auth/session.guard';
import { actor, guard } from './platform.controller';
import type { Role } from '../auth/roles';

/**
 * Platform administration (control plane). Every route requires a
 * platform-scoped capability held by a platform_admin principal; tenant
 * roles can never reach these endpoints because no tenant role is granted
 * platform.* capabilities.
 */
@UseGuards(SessionGuard, CapabilityGuard)
@Controller('platform')
export class PlatformAdminController {
  constructor(private readonly platform: PlatformService) {}

  @Get('organizations')
  @RequireCapability('platform.tenants.read')
  listOrganizations() {
    return guard(() => this.platform.listTenantDirectory());
  }

  @Get('organizations/:id')
  @RequireCapability('platform.tenants.read')
  organizationDetail(@Param('id') id: string) {
    return guard(() => this.platform.tenantDetail(id));
  }

  @Post('organizations/:id/provision')
  @RequireCapability('platform.tenants.provision')
  provisionAdmin(
    @Req() req: { principal?: Principal },
    @Param('id') id: string,
    @Body() body: { email: string; displayName: string; password: string; role?: Role; electionId?: string | null },
  ) {
    return guard(() =>
      this.platform.provisionTenantAdmin(actor(req), id, {
        email: body.email, displayName: body.displayName, password: body.password,
        role: body.role, electionId: body.electionId ?? null,
      }),
    );
  }

  @Delete('organizations/:id/users/:userId')
  @RequireCapability('platform.tenants.provision')
  deleteUser(@Req() req: { principal?: Principal }, @Param('id') id: string, @Param('userId') userId: string) {
    return guard(async () => { await this.platform.deleteUser(actor(req), id, userId); return { deleted: true }; });
  }

  @Get('health')
  @RequireCapability('platform.health.read')
  health() {
    return guard(() => this.platform.platformHealth());
  }
}
