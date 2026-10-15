CREATE TYPE "public"."activity_field" AS ENUM('status', 'priority', 'dates', 'content');--> statement-breakpoint
CREATE TYPE "public"."activity_source" AS ENUM('user', 'ai_suggestion');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('needs_review', 'in_review', 'planned', 'ice_box');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('new_project', 'bug_fix', 'feature_request');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('internal', 'external', 'both');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"field" "activity_field" NOT NULL,
	"old_value" text,
	"new_value" text,
	"source" "activity_source" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"suggested_priority" "priority" NOT NULL,
	"confidence" "confidence" NOT NULL,
	"rationale" text NOT NULL,
	"model" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" "submission_type" NOT NULL,
	"date_needed_by" date NOT NULL,
	"impacted_users" integer NOT NULL,
	"user_type" "user_type" NOT NULL,
	"impact_of_delay" text NOT NULL,
	"status" "status" DEFAULT 'needs_review' NOT NULL,
	"priority" "priority",
	"start_date" date,
	"end_date" date,
	"submitted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impacted_users_min" CHECK ("submissions"."impacted_users" >= 1),
	CONSTRAINT "planned_requires_dates" CHECK ("submissions"."status" <> 'planned' OR ("submissions"."start_date" IS NOT NULL AND "submissions"."end_date" IS NOT NULL)),
	CONSTRAINT "end_after_start" CHECK ("submissions"."end_date" IS NULL OR "submissions"."start_date" IS NULL OR "submissions"."end_date" >= "submissions"."start_date")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_submission_time_idx" ON "activity" USING btree ("submission_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_suggestions_submission_idx" ON "ai_suggestions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_user_time_idx" ON "ai_suggestions" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_planned_start_idx" ON "submissions" USING btree ("start_date") WHERE "submissions"."status" = 'planned';