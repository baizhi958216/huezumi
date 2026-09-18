CREATE TABLE "connection_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"encrypted_secrets" text NOT NULL,
	"has_credentials" boolean NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_key" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_connections_import_key_unique" UNIQUE("import_key")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'platform' NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"project_id" uuid,
	"generation_id" uuid,
	"prompt_id" text,
	"request" jsonb,
	"workflow" jsonb,
	"source_version_id" uuid,
	"base_version_id" uuid,
	"connection_version_id" uuid,
	"quote_id" uuid,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"settlement_status" text DEFAULT 'reserved' NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"charged_credits" integer,
	"result_version_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_generation_id_unique" UNIQUE("generation_id"),
	CONSTRAINT "runs_prompt_id_unique" UNIQUE("prompt_id")
);
--> statement-breakpoint
CREATE TABLE "text_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"model" text NOT NULL,
	"length" text NOT NULL,
	"credits" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"run_id" uuid,
	"document_id" uuid,
	"version_id" uuid,
	"asset_id" uuid,
	"generation_id" uuid,
	"source_key" text NOT NULL,
	"source_file" jsonb,
	"availability" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "rule_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "connection_version_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "kind" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "connection_version_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "platform_request" jsonb;--> statement-breakpoint
ALTER TABLE "connection_versions" ADD CONSTRAINT "connection_versions_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_creative_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."creative_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_source_version_id_creative_document_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."creative_document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_connection_version_id_connection_versions_id_fk" FOREIGN KEY ("connection_version_id") REFERENCES "public"."connection_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_result_version_id_creative_document_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."creative_document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_prices" ADD CONSTRAINT "text_prices_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_project_id_creative_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."creative_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_document_id_creative_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."creative_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_version_id_creative_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."creative_document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_version_unique" ON "connection_versions" USING btree ("connection_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "run_owner_idempotency_unique" ON "runs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "run_owner_created_idx" ON "runs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "text_price_version_unique" ON "text_prices" USING btree ("connection_id","model","length","version");--> statement-breakpoint
CREATE INDEX "work_owner_created_idx" ON "works" USING btree ("owner_id","created_at");