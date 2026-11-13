CREATE SCHEMA "fraud";
--> statement-breakpoint
CREATE TABLE "fraud"."blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"signal_hash" text NOT NULL,
	"election_id" uuid,
	"rule" text NOT NULL,
	"reason" text NOT NULL,
	"score" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" text
);
--> statement-breakpoint
CREATE TABLE "fraud"."events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fraud"."events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"election_id" uuid,
	"rule" text NOT NULL,
	"score" integer NOT NULL,
	"action" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"signal_kind" text,
	"signal_hash" text,
	"ref_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud"."signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fraud"."signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"election_id" uuid,
	"kind" text NOT NULL,
	"signal_hash" text NOT NULL,
	"ref_hash" text,
	"surface" text NOT NULL,
	"ua_class" text,
	"score" integer DEFAULT 0 NOT NULL,
	"action" text DEFAULT 'allow' NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fraud_blocks_lookup" ON "fraud"."blocks" USING btree ("kind","signal_hash");--> statement-breakpoint
CREATE INDEX "fraud_events_election" ON "fraud"."events" USING btree ("election_id","created_at");--> statement-breakpoint
CREATE INDEX "fraud_signals_lookup" ON "fraud"."signals" USING btree ("kind","signal_hash","created_at");--> statement-breakpoint
CREATE INDEX "fraud_signals_election" ON "fraud"."signals" USING btree ("election_id","kind","created_at");