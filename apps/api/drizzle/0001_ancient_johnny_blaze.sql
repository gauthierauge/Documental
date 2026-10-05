CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_name_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name")
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_parent_id_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_parent_idx" ON "document" USING btree ("parent_id");