import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * Consistent table loading skeleton — replaces the "—"/flash on initial load.
 */
export function TableSkeleton({ rows = 6, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full space-y-2" aria-busy="true" aria-label="A carregar…">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`r-${r}`}
          className="grid gap-3 py-2 border-b border-border/40"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`r-${r}-c-${c}`} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default TableSkeleton;