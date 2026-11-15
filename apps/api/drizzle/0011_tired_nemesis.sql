CREATE TABLE "admin"."candidate_photos" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."candidate_photos" ADD CONSTRAINT "candidate_photos_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "admin"."candidates"("id") ON DELETE cascade ON UPDATE no action;