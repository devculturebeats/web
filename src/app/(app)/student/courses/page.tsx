import { redirect } from "next/navigation";

import { StudentCourses } from "@/components/student/student-courses";
import { getCurrentProfile } from "@/lib/profiles";
import { loadStudentDashboardData } from "@/lib/student/data";

export default async function StudentCoursesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "student") redirect("/dashboard");

  const { myClasses } = await loadStudentDashboardData(profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">My Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Courses you&apos;re enrolled in. Open one for full details.
        </p>
      </div>
      <StudentCourses myClasses={myClasses} />
    </div>
  );
}
