/**
 * Tenant context. The tenant is resolved from the authenticated
 * principal (SEC-TEN-01), never from client-supplied parameters alone.
 * Every tenant-scoped query must run inside withTenantTransaction,
 * which sets app.tenant_id so PostgreSQL RLS (SEC-TEN-02) applies.
 */
export interface TenantContext {
  organizationId: string;
  userId: string;
}

export function tenantContextFromPrincipal(principal: {
  userId: string;
  organizationId: string | null;
}): TenantContext {
  if (!principal.organizationId) {
    throw new Error('TENANT_REQUIRED: principal has no organization context');
  }
  return { organizationId: principal.organizationId, userId: principal.userId };
}

/** Shape of the minimal DB handle this module needs (Drizzle transaction). */
export interface TenantDb {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  transaction<T>(fn: (tx: TenantDb) => Promise<T>): Promise<T>;
}

export async function withTenantTransaction<T>(
  db: TenantDb,
  ctx: TenantContext,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // `true` = transaction-local; cannot leak to the next pooled request.
    await tx.execute(`SELECT set_config('app.tenant_id', $1, true)`, [ctx.organizationId]);
    return fn(tx);
  });
}

/**
 * Guard used by handlers: a requested organization id (from route/body)
 * must match the authenticated tenant. Mismatch is a cross-tenant
 * access attempt: reject and let the caller audit it (SEC-TEN-03).
 */
export function assertTenantAccess(ctx: TenantContext, requestedOrganizationId: string): void {
  if (ctx.organizationId !== requestedOrganizationId) {
    throw new Error('CROSS_TENANT_ACCESS: requested organization does not match authenticated tenant');
  }
}
