ALTER TYPE "public"."activity_field" ADD VALUE 'impact';--> statement-breakpoint
CREATE TABLE "impact_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"people_impacted" integer NOT NULL,
	"hours_saved" integer NOT NULL,
	"cost_reduced" bigint NOT NULL,
	"revenue_increased" bigint NOT NULL,
	"confidence" "confidence" NOT NULL,
	"rationale" text NOT NULL,
	"model" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impacts" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"people_impacted" integer NOT NULL,
	"hours_saved" integer NOT NULL,
	"cost_reduced" bigint NOT NULL,
	"revenue_increased" bigint NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "impact_suggestions" ADD CONSTRAINT "impact_suggestions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_suggestions" ADD CONSTRAINT "impact_suggestions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impacts" ADD CONSTRAINT "impacts_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impacts" ADD CONSTRAINT "impacts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impact_suggestions_submission_idx" ON "impact_suggestions" USING btree ("submission_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "impact_suggestions_user_time_idx" ON "impact_suggestions" USING btree ("requested_by","created_at");--> statement-breakpoint
UPDATE "submissions" SET "completed_at" = "updated_at" WHERE "status" = 'done' AND "completed_at" IS NULL;
