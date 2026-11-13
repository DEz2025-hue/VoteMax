import { describe, it, expect, vi } from 'vitest';
import {
  assertTenantAccess,
  tenantContextFromPrincipal,
  withTenantTransaction,
  type TenantDb,
} from './tenancy';

describe('tenancy isolation (SEC-TEN-01/02/03)', () => {
  it('rejects cross-tenant access attempts', () => {
    const ctx = { organizationId: 'org-1', userId: 'u-1' };
    expect(() => assertTenantAccess(ctx, 'org-2')).toThrow(/CROSS_TENANT_ACCESS/);
    expect(() => assertTenantAccess(ctx, 'org-1')).not.toThrow();
  });

  it('tenant comes from the principal, not the request', () => {
    expect(() =>
      tenantContextFromPrincipal({ userId: 'u-1', organizationId: null }),
    ).toThrow(/TENANT_REQUIRED/);
    expect(
      tenantContextFromPrincipal({ userId: 'u-1', organizationId: 'org-9' }),
    ).toEqual({ organizationId: 'org-9', userId: 'u-1' });
  });

  it('sets transaction-local tenant before running queries', async () => {
    const calls: string[] = [];
    const tx: TenantDb = {
      execute: vi.fn(async (sql: string) => {
        calls.push(sql);
      }),
      transaction: async (fn) => fn(tx),
    };
    const db: TenantDb = {
      execute: vi.fn(async () => undefined),
      transaction: async (fn) => fn(tx),
    };
    await withTenantTransaction(db, { organizationId: 'org-1', userId: 'u-1' }, async (t) => {
      await t.execute('SELECT * FROM admin.role_assignments');
      return null;
    });
    expect(calls[0]).toContain("set_config('app.tenant_id'");
    expect(calls[1]).toContain('role_assignments');
  });
});
