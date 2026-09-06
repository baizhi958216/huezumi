CREATE TYPE "public"."model_asset_kind" AS ENUM('checkpoint', 'lora', 'vae', 'clip', 'unet', 'controlnet', 'embedding', 'upscale', 'other');--> statement-breakpoint
CREATE TYPE "public"."model_asset_source" AS ENUM('upload', 'civitai', 'training', 'platform');--> statement-breakpoint
CREATE TYPE "public"."model_asset_status" AS ENUM('pending', 'ready', 'failed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."model_asset_visibility" AS ENUM('private', 'shared', 'platform');--> statement-breakpoint
CREATE TABLE "model_asset_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"target_directory" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" text,
	"object_key" text,
	"local_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "model_asset_kind" DEFAULT 'other' NOT NULL,
	"source" "model_asset_source" NOT NULL,
	"source_ref" text,
	"base_model" text,
	"description" text,
	"trigger_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" "model_asset_visibility" DEFAULT 'private' NOT NULL,
	"status" "model_asset_status" DEFAULT 'pending' NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "model_asset_files" ADD CONSTRAINT "model_asset_files_model_asset_id_model_assets_id_fk" FOREIGN KEY ("model_asset_id") REFERENCES "public"."model_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_assets" ADD CONSTRAINT "model_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_asset_files_asset_idx" ON "model_asset_files" USING btree ("model_asset_id");--> statement-breakpoint
CREATE INDEX "model_assets_owner_idx" ON "model_assets" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "model_assets_status_idx" ON "model_assets" USING btree ("status","updated_at");