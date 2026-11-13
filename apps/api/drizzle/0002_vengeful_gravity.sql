CREATE SCHEMA "ballot";
--> statement-breakpoint
CREATE SCHEMA "results";
--> statement-breakpoint
CREATE TABLE "ballot"."idempotency_keys" (
	"entitlement_id" uuid NOT NULL,
	"key" text NOT NULL,
	"receipt_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_entitlement_id_key_pk" PRIMARY KEY("entitlement_id","key")
);
--> statement-breakpoint
CREATE TABLE "identity"."ballot_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"voter_record_id" uuid NOT NULL,
	"election_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot"."ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"ciphertext_hash" text NOT NULL,
	"coarse_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results"."certifications" (
	"election_id" uuid PRIMARY KEY NOT NULL,
	"certified_by" text NOT NULL,
	"second_approver" text NOT NULL,
	"tally_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot"."election_keys" (
	"election_id" uuid PRIMARY KEY NOT NULL,
	"key_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."otp_challenges" (
	"key" text PRIMARY KEY NOT NULL,
	"election_id" uuid NOT NULL,
	"voter_record_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results"."tally_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"ballot_count" integer NOT NULL,
	"counts" jsonb NOT NULL,
	"evidence_root" text NOT NULL,
	"tally_hash" text NOT NULL,
	"authorized_by" text NOT NULL,
	"executed_by" text NOT NULL,
	"approvers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."entitlements" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "ballot"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "identity"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."ballot_sessions" ADD CONSTRAINT "ballot_sessions_voter_record_id_voter_records_id_fk" FOREIGN KEY ("voter_record_id") REFERENCES "identity"."voter_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."ballot_sessions" ADD CONSTRAINT "ballot_sessions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."ballot_sessions" ADD CONSTRAINT "ballot_sessions_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "identity"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot"."ballots" ADD CONSTRAINT "ballots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results"."certifications" ADD CONSTRAINT "certifications_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot"."election_keys" ADD CONSTRAINT "election_keys_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."otp_challenges" ADD CONSTRAINT "otp_challenges_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."otp_challenges" ADD CONSTRAINT "otp_challenges_voter_record_id_voter_records_id_fk" FOREIGN KEY ("voter_record_id") REFERENCES "identity"."voter_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results"."tally_runs" ADD CONSTRAINT "tally_runs_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Append-only enforcement (SEC-BAL-03, SEC-AUD-02): ballots and audit records
-- may be inserted but never updated or deleted, at the database level.
CREATE OR REPLACE FUNCTION public.votery_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % does not allow %', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ballots_append_only
  BEFORE UPDATE OR DELETE ON "ballot"."ballots"
  FOR EACH ROW EXECUTE FUNCTION public.votery_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_records_append_only
  BEFORE UPDATE OR DELETE ON "audit"."audit_records"
  FOR EACH ROW EXECUTE FUNCTION public.votery_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER idempotency_keys_append_only
  BEFORE UPDATE OR DELETE ON "ballot"."idempotency_keys"
  FOR EACH ROW EXECUTE FUNCTION public.votery_reject_mutation();
