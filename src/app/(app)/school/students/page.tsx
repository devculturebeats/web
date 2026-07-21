import { redirect } from "next/navigation";

import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { SchoolStudentsTabs } from "@/components/school/school-students-tabs";
import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";
import {
  loadSchoolBatches,
  loadSchoolPendingStudentInvites,
  loadSchoolStudents,
} from "@/lib/school/data";

export default async function SchoolStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "school_admin") redirect("/dashboard");

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  const params = await searchParams;
  const defaultTab = params.tab === "batches" ? "batches" : "students";

  const [batches, students, pendingInvites] = await Promise.all([
    loadSchoolBatches(org.id),
    loadSchoolStudents(org.id),
    loadSchoolPendingStudentInvites(org.id),
  ]);
  const isApproved = org.approval_status === "approved";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Students
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import a roster, invite by email, and manage batches.
        </p>
      </div>
      <PendingApprovalBanner status={org.approval_status} />
      <SchoolStudentsTabs
        students={students}
        pendingInvites={pendingInvites}
        batches={batches}
        disabled={!isApproved}
        defaultTab={defaultTab}
      />
    </div>
  );
}
