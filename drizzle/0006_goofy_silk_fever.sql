CREATE TYPE "public"."creative_project_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "creative_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"model" text,
	"prompt_snapshot" jsonb,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "creative_project_status" DEFAULT 'active' NOT NULL,
	"last_active_stage" text DEFAULT 'article' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_document_versions" ADD CONSTRAINT "creative_document_versions_document_id_creative_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."creative_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_documents" ADD CONSTRAINT "creative_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_documents" ADD CONSTRAINT "creative_documents_project_id_creative_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_projects" ADD CONSTRAINT "creative_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_document_version_unique" ON "creative_document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "creative_document_versions_document_idx" ON "creative_document_versions" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "creative_documents_owner_idx" ON "creative_documents" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "creative_documents_project_idx" ON "creative_documents" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "creative_projects_owner_idx" ON "creative_projects" USING btree ("owner_id","updated_at");