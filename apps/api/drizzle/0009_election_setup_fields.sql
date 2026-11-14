ALTER TABLE "admin"."elections" ADD COLUMN "vote_type" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."elections" ADD COLUMN "results_mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."elections" ADD COLUMN "announcement" text;