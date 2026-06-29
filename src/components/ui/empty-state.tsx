import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard empty state used wherever a list/table can be empty.
 * Icon + clear message + optional CTA.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6 rounded-lg border border-dashed border-border bg-muted/20",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 text-muted-foreground/70 [&_svg]:h-10 [&_svg]:w-10">{icon}</div>
      ) : null}
      <div className="text-base font-medium text-foreground">{title}</div>
      {description ? (
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export default EmptyState;