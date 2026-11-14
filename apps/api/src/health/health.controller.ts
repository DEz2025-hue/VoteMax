import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'votemax-api',
      phase: '1-foundations',
      // No election data is served in Phase 1. This endpoint reports
      // platform liveness only and contains no voter or ballot data.
    };
  }
}
