DELETE FROM "admin"."role_assignments" WHERE "role"::text NOT IN ('platform_admin', 'organization_owner', 'auditor', 'voter');--> statement-breakpoint
DROP TABLE "admin"."stations" CASCADE;--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" DROP COLUMN "station_id";--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('platform_admin', 'organization_owner', 'auditor', 'voter');--> statement-breakpoint
ALTER TABLE "admin"."role_assignments" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";