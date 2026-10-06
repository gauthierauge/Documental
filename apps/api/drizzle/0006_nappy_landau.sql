CREATE TABLE "document_message" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"document_id" text NOT NULL,
	"author_id" text NOT NULL,
	"text" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_message_client_unique" UNIQUE("document_id","author_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "document_message" ADD CONSTRAINT "document_message_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_message" ADD CONSTRAINT "document_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_message_document_idx" ON "document_message" USING btree ("document_id","id");