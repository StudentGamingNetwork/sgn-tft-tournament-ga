CREATE TYPE "public"."tier" AS ENUM('CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON', 'UNRANKED');--> statement-breakpoint
CREATE TABLE "lobby_rotation_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid,
	"game_number" integer NOT NULL,
	"lobby_index" integer NOT NULL,
	"seed_assignments" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_phase_game_lobby" UNIQUE("phase_id","game_number","lobby_index")
);
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "tier" "tier";--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "league_points" integer;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "points" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_rotation_matrix" ADD CONSTRAINT "lobby_rotation_matrix_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint