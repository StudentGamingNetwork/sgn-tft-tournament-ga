import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";

const scoring = [
  { rank: 1, points: 8 },
  { rank: 2, points: 7 },
  { rank: 3, points: 6 },
  { rank: 4, points: 5 },
  { rank: 5, points: 4 },
  { rank: 6, points: 3 },
  { rank: 7, points: 2 },
  { rank: 8, points: 1 },
];

export default function RulesPage() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">Format et règlement</h1>
        <p className="text-default-500 mt-2">
          Règles opérationnelles du tournoi TFT (format des phases, barème et tie-break).
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">Structure des phases</h2>
          <ul className="space-y-2 text-sm text-default-700">
            <li>Phase 1: de 64 à 128 joueurs, toujours par multiple de 8.</li>
            <li>Phase 2: qualifiés restants de P1 selon le palier du tournoi.</li>
            <li>Phase 3: split Master/Amateur, avec Master prioritaire jusqu'à 64 joueurs.</li>
            <li>Phase 4: Master/Amateur, avec élimination en Master à partir de la game 3 (top 16).</li>
            <li>Phase 5: finales Challenger, Master, Amateur (8 joueurs chacun).</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">Tie-break</h2>
          <ul className="space-y-2 text-sm text-default-700">
            <li>1. Total de points</li>
            <li>2. Nombre de top 1</li>
            <li>3. Nombre de top 4</li>
            <li>4. Puis critères de placements (top 2, top 3, etc.)</li>
            <li>5. Seed initial si égalité persistante</li>
          </ul>
          <div className="mt-4">
            <Chip size="sm" color="warning" variant="flat">
              Validation résultats: 8 joueurs, positions 1..8 uniques
            </Chip>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">Barème de points</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default-200 text-left text-default-500">
                <th className="py-2 pr-3">Placement</th>
                <th className="py-2 pr-3">Points</th>
              </tr>
            </thead>
            <tbody>
              {scoring.map((row) => (
                <tr key={row.rank} className="border-b border-default-100">
                  <td className="py-2 pr-3">#{row.rank}</td>
                  <td className="py-2 pr-3 font-semibold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
