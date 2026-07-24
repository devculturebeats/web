import { redirect } from "next/navigation";

import { AppNav } from "@/components/app/app-nav";
import { isTeacherApproved } from "@/lib/auth/teacher-gate";
import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  let orgApproved = true;
  if (profile.role === "school_admin" || profile.role === "academy_admin") {
    const org = await getCurrentOrganization();
    orgApproved = org?.approval_status === "approved";
  }

  const teacherApproved =
    profile.role !== "teacher" || isTeacherApproved(profile);

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <AppNav
        profile={profile}
        orgApproved={orgApproved}
        teacherApproved={teacherApproved}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
