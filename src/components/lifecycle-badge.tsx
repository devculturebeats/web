import { Badge } from "@/components/ui/badge";
import type { ClassLifecycle } from "@/types/database";

const variantMap: Record<
  ClassLifecycle,
  "default" | "secondary" | "destructive" | "outline"
> = {
  requested: "secondary",
  accepted: "default",
  rejected: "destructive",
  scheduled: "default",
  postponed: "outline",
  completed: "secondary",
  cancelled: "destructive",
};

const labelMap: Record<ClassLifecycle, string> = {
  requested: "Waiting on teacher",
  accepted: "Accepted",
  rejected: "Declined",
  scheduled: "Scheduled",
  postponed: "Postponed",
  completed: "Done",
  cancelled: "Cancelled",
};

export function lifecycleLabel(status: ClassLifecycle | string): string {
  return labelMap[status as ClassLifecycle] ?? status;
}

export function LifecycleBadge({ status }: { status: ClassLifecycle | string }) {
  const variant =
    variantMap[status as ClassLifecycle] ?? ("outline" as const);

  return (
    <Badge variant={variant}>{lifecycleLabel(status)}</Badge>
  );
}
