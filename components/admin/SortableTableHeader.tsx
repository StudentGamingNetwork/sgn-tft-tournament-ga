import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface SortableTableHeaderProps<T extends string = string> {
    label: string;
    columnKey: T;
    currentSortColumn: string | null;
    sortDirection: "asc" | "desc";
    onSort: (column: T) => void;
}

export function SortableTableHeader<T extends string = string>({
    label,
    columnKey,
    currentSortColumn,
    sortDirection,
    onSort,
}: SortableTableHeaderProps<T>) {
    const getSortIcon = () => {
        if (currentSortColumn !== columnKey) {
            return <ArrowUpDown size={14} className="opacity-40" />;
        }
        return sortDirection === "asc" ?
            <ArrowUp size={14} className="text-primary" /> :
            <ArrowDown size={14} className="text-primary" />;
    };

    return (
        <button
            className="flex items-center gap-1 hover:opacity-80"
            onClick={() => onSort(columnKey)}
        >
            {label} {getSortIcon()}
        </button>
    );
}
