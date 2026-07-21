import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApprovalStatus } from "@/types/database";

export function PendingApprovalBanner({
  status,
}: {
  status: ApprovalStatus | string;
}) {
  if (status === "approved") return null;

  const isRejected = status === "rejected";

  return (
    <Alert variant={isRejected ? "destructive" : "default"}>
      <AlertCircleIcon />
      <AlertTitle>
        {isRejected ? "Organization rejected" : "Pending approval"}
      </AlertTitle>
      <AlertDescription>
        {isRejected
          ? "Your organization was not approved. Contact support to resolve this before using operational features."
          : "Your organization is awaiting admin approval. Batches, classes, student linking, and notifications are disabled until approved."}
      </AlertDescription>
    </Alert>
  );
}
