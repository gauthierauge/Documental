CREATE TABLE "document_operation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"revision" integer NOT NULL,
	"operation_id" text NOT NULL,
	"operation" jsonb NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_operation_revision_unique" UNIQUE("document_id","revision"),
	CONSTRAINT "document_operation_id_unique" UNIQUE("document_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_operation" ADD CONSTRAINT "document_operation_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_operation" ADD CONSTRAINT "document_operation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;