import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Standard page header used across the Comercial module.
 * Title (h1) + short description + right-aligned actions.
 */
export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 flex-wrap", className)} data-tour="page-header">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2 leading-tight">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-wrap shrink-0" data-tour="page-actions">{actions}</div>
      ) : null}
    </div>
  );
}

export default PageHeader;