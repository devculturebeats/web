import { redirect } from "next/navigation";

import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { SchoolTeacherNeedForm } from "@/components/school/school-teacher-need-form";
import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";

export default async function SchoolRequestTeacherPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "school_admin") redirect("/dashboard");

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Request a teacher
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us the activity, days, and timing. CultureBeats will match a
          teacher — schools don’t browse the teacher list.
        </p>
      </div>
      <PendingApprovalBanner status={org.approval_status} />
      <SchoolTeacherNeedForm org={org} />
    </div>
  );
}
