import { Card } from "@heroui/card";
import { Button } from "@heroui/button";
import { Link } from "@heroui/link";
import { desc } from "drizzle-orm";

import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { tournament } from "@/models/schema";

async function getRulesUrl() {
  let tournaments: Array<{
    status: "upcoming" | "ongoing" | "completed";
    rulesUrl: string | null;
  }> = [];

  try {
    tournaments = await db
      .select({
        status: tournament.status,
        rulesUrl: tournament.rules_url,
      })
      .from(tournament)
      .orderBy(desc(tournament.createdAt));
  } catch (error) {
    const pgErrorCode = (error as { cause?: { code?: string } })?.cause?.code;
    if (pgErrorCode !== "42703") {
      throw error;
    }

    tournaments = await db
      .select({
        status: tournament.status,
      })
      .from(tournament)
      .orderBy(desc(tournament.createdAt))
      .then((rows) => rows.map((row) => ({ ...row, rulesUrl: null })));
  }

  const featuredTournament =
    tournaments.find((item) => item.status === "ongoing") || tournaments[0] || null;

  return featuredTournament?.rulesUrl || siteConfig.links.rules;
}

export default async function RulesPage() {
  const rulesUrl = await getRulesUrl();

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="p-8 border border-divider max-w-2xl w-full text-center">
        <h1 className="text-2xl font-bold">Règlement officiel</h1>
        <p className="text-default-500 mt-3">
          Le règlement du tournoi est consultable via le lien officiel.
        </p>
        <div className="mt-6">
          <Button
            as={Link}
            color="primary"
            href={rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ouvrir le règlement
          </Button>
        </div>
      </Card>
    </div>
  );
}
