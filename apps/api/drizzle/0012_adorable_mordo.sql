ALTER TABLE "admin"."elections" ADD COLUMN "auto_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."elections" ADD COLUMN "auto_close" boolean DEFAULT true NOT NULL;