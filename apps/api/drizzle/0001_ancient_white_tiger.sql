CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE TYPE "public"."election_state" AS ENUM('DRAFT', 'CONFIGURED', 'REGISTRATION', 'REGISTER_FROZEN', 'READY', 'OPEN', 'SUSPENDED', 'CLOSED', 'TALLIED', 'VERIFIED', 'RECOUNT', 'CERTIFIED', 'PUBLISHED', 'ARCHIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."voter_status" AS ENUM('pending', 'eligible', 'ineligible', 'duplicate_unresolved', 'suspended');--> statement-breakpoint
CREATE TABLE "admin"."candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"statement" text,
	"photo_url" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"state" "election_state" DEFAULT 'DRAFT' NOT NULL,
	"timezone" text DEFAULT 'Africa/Monrovia' NOT NULL,
	"voting_opens_at" timestamp with time zone,
	"voting_closes_at" timestamp with time zone,
	"ballot_order_policy" text DEFAULT 'fixed' NOT NULL,
	"register_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"voter_record_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_voter_record_id_unique" UNIQUE("voter_record_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"title" text NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"max_choices" integer DEFAULT 1 NOT NULL,
	"allow_abstain" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."voter_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" "voter_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "admin"."candidates" ADD CONSTRAINT "candidates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "admin"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."elections" ADD CONSTRAINT "elections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."entitlements" ADD CONSTRAINT "entitlements_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."entitlements" ADD CONSTRAINT "entitlements_voter_record_id_voter_records_id_fk" FOREIGN KEY ("voter_record_id") REFERENCES "identity"."voter_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."positions" ADD CONSTRAINT "positions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."stations" ADD CONSTRAINT "stations_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."voter_records" ADD CONSTRAINT "voter_records_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;