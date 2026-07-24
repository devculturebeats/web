import { ApprovalBadge } from "@/components/org/approval-badge";
import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import type { Organization } from "@/types/database";

export function SchoolHeader({ org }: { org: Organization }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {org.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          School ID {org.lookup_code}
          {[org.city, org.area].filter(Boolean).length
            ? ` · ${[org.city, org.area].filter(Boolean).join(", ")}`
            : ""}
        </p>
      </div>
      {org.approval_status !== "approved" && (
        <ApprovalBadge status={org.approval_status} />
      )}
      <PendingApprovalBanner status={org.approval_status} />
    </div>
  );
}
