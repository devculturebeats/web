import { redirect } from "next/navigation";

import { sendNotification } from "@/app/(app)/school/actions";
import { NotifyPanel } from "@/components/org/notify-panel";
import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";
import { loadSchoolNotifyClasses } from "@/lib/school/data";

export default async function SchoolNotifyPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "school_admin") redirect("/dashboard");

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  const classes = await loadSchoolNotifyClasses(org.id);
  const isApproved = org.approval_status === "approved";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Notify
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a quick note to students about schedule changes or announcements.
        </p>
      </div>
      <PendingApprovalBanner status={org.approval_status} />
      <NotifyPanel
        classes={classes}
        disabled={!isApproved}
        onSend={sendNotification}
      />
    </div>
  );
}
