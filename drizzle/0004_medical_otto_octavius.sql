ALTER TABLE "workflows" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX "workflows_visibility_idx" ON "workflows" USING btree ("visibility","updated_at");