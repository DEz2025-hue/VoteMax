CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('platform_admin', 'organization_owner', 'committee_chair', 'election_admin', 'voter_registrar', 'candidate', 'voter', 'station_officer', 'observer', 'auditor');--> statement-breakpoint
CREATE TABLE "audit"."audit_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit"."audit_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "admin"."role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"election_id" uuid,
	"station_id" uuid,
	"granted_by" uuid,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" ADD CONSTRAINT "role_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" ADD CONSTRAINT "role_assignments_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "admin"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Tenant isolation defence-in-depth (SEC-TEN-02): RLS beneath application checks.
-- The API sets transaction-local app.tenant_id from the authenticated principal
-- (SEC-TEN-01) inside withTenantTransaction; policies compare against it.
ALTER TABLE "admin"."role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "role_assignments_tenant_isolation" ON "admin"."role_assignments"
	USING ("organization_id" = current_setting('app.tenant_id', true)::uuid)
	WITH CHECK ("organization_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "audit"."audit_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_records_tenant_isolation" ON "audit"."audit_records"
	USING ("organization_id" IS NULL OR "organization_id" = current_setting('app.tenant_id', true)::uuid)
	WITH CHECK ("organization_id" IS NULL OR "organization_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
-- Audit records are append-only for non-owner roles (SEC-AUD-02).
REVOKE UPDATE, DELETE ON "audit"."audit_records" FROM PUBLIC;