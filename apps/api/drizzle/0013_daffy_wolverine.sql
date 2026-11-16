CREATE TABLE "admin"."election_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."election_approvals" ADD CONSTRAINT "election_approvals_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "admin"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "election_approvals_unique" ON "admin"."election_approvals" USING btree ("election_id","user_id","kind");