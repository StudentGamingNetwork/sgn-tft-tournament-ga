CREATE TYPE "public"."registration_status" AS ENUM('registered', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "tournament_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'registered' NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_tournament_player" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "tournament_registration" ADD CONSTRAINT "tournament_registration_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_registration" ADD CONSTRAINT "tournament_registration_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;