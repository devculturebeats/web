import Link from "next/link";
import { redirect } from "next/navigation";

import {
  loadParentHomeData,
} from "@/app/(app)/parent/actions";
import { ParentStudentSwitcher } from "@/components/parent/parent-home";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { getCurrentProfile } from "@/lib/profiles";

export default async function ParentCoursesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "parent") redirect("/dashboard");

  const data = await loadParentHomeData(profile.id);
  const selected = data.children.find(
    (c) => c.studentProfileId === data.selectedChildId,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Classes
          </h1>
          <p className="mt-1 text-muted-foreground">
            {selected
              ? `Enrolled classes for ${selected.fullName}`
              : "Link a student to see their classes."}
          </p>
        </div>
        <ParentStudentSwitcher
          childrenList={data.children}
          selectedChildId={data.selectedChildId}
        />
      </div>

      {data.myClasses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No enrolled classes.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.myClasses.map((cls) => (
            <li
              key={cls.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <Link
                  href={`/classes/${cls.id}`}
                  className="font-medium hover:underline"
                >
                  {cls.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[cls.orgName, cls.teacherName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <LifecycleBadge status={cls.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
