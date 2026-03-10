import { Card } from "@heroui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    colorClass: "primary" | "success" | "warning" | "secondary" | "danger";
}

export function StatsCard({ icon: Icon, label, value, colorClass }: StatsCardProps) {
    return (
        <Card className="p-4">
            <div className="flex items-center gap-3">
                <div className={`p-3 bg-${colorClass}-100 rounded-lg`}>
                    <Icon size={24} className={`text-${colorClass}`} />
                </div>
                <div>
                    <p className="text-sm text-default-500">{label}</p>
                    <p className="text-2xl font-bold">{value}</p>
                </div>
            </div>
        </Card>
    );
}
