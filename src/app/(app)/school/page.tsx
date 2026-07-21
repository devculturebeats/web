import { redirect } from "next/navigation";

import { SchoolHeader } from "@/components/school/school-header";
import { SchoolRequestTeachers } from "@/components/school/school-request-teachers";
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
      <SchoolHeader org={org} />
      <SchoolRequestTeachers org={org} />
    </div>
  );
}
