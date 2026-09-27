import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center", className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action, className }: { title?: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-xl border border-danger/25 bg-danger/5 px-6 py-12 text-center", className)}>
      <AlertTriangle className="mb-3 size-8 text-danger" />
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
