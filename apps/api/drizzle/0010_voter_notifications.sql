CREATE TABLE "admin"."notification_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin"."notification_batches" ADD CONSTRAINT "notification_batches_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."notification_batches" ADD CONSTRAINT "notification_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_batches_election" ON "admin"."notification_batches" USING btree ("election_id");