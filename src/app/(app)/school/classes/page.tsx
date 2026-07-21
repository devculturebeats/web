import { redirect } from "next/navigation";

import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { SchoolScheduledClasses } from "@/components/school/school-scheduled-classes";
import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";
import { loadSchoolClasses } from "@/lib/school/data";

export const dynamic = "force-dynamic";

export default async function SchoolClassesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "school_admin") redirect("/dashboard");

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  const classes = await loadSchoolClasses(org.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Scheduled classes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upcoming meetings with your teachers.
        </p>
      </div>
      <PendingApprovalBanner status={org.approval_status} />
      <SchoolScheduledClasses classes={classes} />
    </div>
  );
}
