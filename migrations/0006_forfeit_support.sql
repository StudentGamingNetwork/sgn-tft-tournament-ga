CREATE TYPE "result_status" AS ENUM('normal', 'forfeit');

ALTER TABLE "results"
ADD COLUMN "result_status" "result_status" NOT NULL DEFAULT 'normal';

ALTER TABLE "results"
DROP CONSTRAINT IF EXISTS "placement_valid";

ALTER TABLE "results"
ADD CONSTRAINT "placement_valid" CHECK ("placement" >= 0 AND "placement" <= 8);

ALTER TABLE "tournament_registration"
ADD COLUMN "forfeited_at" timestamp;