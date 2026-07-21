import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/types/database";

const labels: Record<string, string> = {
  approved: "Approved",
  pending: "Under review",
  rejected: "Not approved",
};

export function ApprovalBadge({ status }: { status: ApprovalStatus | string }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "pending"
        ? "secondary"
        : "destructive";

  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}
