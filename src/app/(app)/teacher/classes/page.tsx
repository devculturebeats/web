import { redirect } from "next/navigation";

import { HomeStudioClassForm } from "@/components/teacher/home-studio-class-form";
import {
  ClassesManager,
  type ClassStudent,
  type TeacherClassData,
} from "@/components/teacher/classes-manager";
import { formatClassRate, formatLocationType } from "@/lib/class-pricing";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassSession } from "@/types/database";

type ClassRow = {
  id: string;
  title: string;
  skill: string | null;
  status: TeacherClassData["status"];
  enrollment_mode: string;
  organization_id: string | null;
  batch_id: string | null;
  is_home_studio: boolean;
  rate_amount: number | null;
  rate_currency: string;
  rate_unit: string;
  location_type: string | null;
  organizations: { name: string } | null;
  class_sessions: ClassSession[];
};

function linkMatchesClass(
  link: { organization_id: string; batch_id: string | null },
  cls: { organization_id: string | null; batch_id: string | null },
): boolean {
  if (!cls.organization_id) return false;
  if (link.organization_id !== cls.organization_id) return false;
  if (link.batch_id === null) return true;
  return link.batch_id === cls.batch_id;
}

export default async function TeacherClassesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");

  const teacherId = profile.teacher?.id;
  if (!teacherId) {
    return (
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold">My classes</h1>
        <p className="text-muted-foreground">
          Complete your teacher profile to manage classes.{" "}
          <a href="/onboarding/teacher" className="underline underline-offset-2">
            Complete profile
          </a>
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: classRows } = await supabase
    .from("classes")
    .select(
      `
      id,
      title,
      skill,
      status,
      enrollment_mode,
      organization_id,
      batch_id,
      is_home_studio,
      rate_amount,
      rate_currency,
      rate_unit,
      location_type,
      organizations (name),
      class_sessions (*)
    `,
    )
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });

  const classes = (classRows ?? []) as ClassRow[];
  const classIds = classes.map((cls) => cls.id);
  const sessionIds = classes.flatMap((cls) =>
    cls.class_sessions.map((session) => session.id),
  );

  const [{ data: enrollments }, { data: assignedLinks }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_enrollments")
          .select("class_id, student_profile_id")
          .in("class_id", classIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("student_links")
      .select("organization_id, batch_id, student_profile_id"),
  ]);

  const profileIds = [
    ...new Set([
      ...(enrollments ?? []).map((row) => row.student_profile_id),
      ...(assignedLinks ?? []).map((row) => row.student_profile_id),
    ]),
  ];

  const { data: profileRows } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [] };

  const profileNames = new Map(
    (profileRows ?? []).map((row) => [row.id, row.full_name?.trim() || "Student"]),
  );

  const { data: attendanceRows } =
    sessionIds.length > 0
      ? await supabase
          .from("attendance")
          .select("session_id, student_profile_id, present")
          .in("session_id", sessionIds)
      : { data: [] as Attendance[] };

  const attendanceBySession: TeacherClassData["attendanceBySession"] = {};
  for (const row of attendanceRows ?? []) {
    if (!attendanceBySession[row.session_id]) {
      attendanceBySession[row.session_id] = {};
    }
    attendanceBySession[row.session_id][row.student_profile_id] = row.present;
  }

  const classData: TeacherClassData[] = classes.map((cls) => {
    const studentsMap = new Map<string, ClassStudent>();

    for (const enrollment of enrollments ?? []) {
      if (enrollment.class_id !== cls.id) continue;
      studentsMap.set(enrollment.student_profile_id, {
        profileId: enrollment.student_profile_id,
        fullName: profileNames.get(enrollment.student_profile_id) ?? "Student",
      });
    }

    if (cls.enrollment_mode === "assigned" && cls.organization_id) {
      for (const link of assignedLinks ?? []) {
        if (!linkMatchesClass(link, cls)) continue;
        if (studentsMap.has(link.student_profile_id)) continue;
        studentsMap.set(link.student_profile_id, {
          profileId: link.student_profile_id,
          fullName: profileNames.get(link.student_profile_id) ?? "Student",
        });
      }
    }

    return {
      id: cls.id,
      title: cls.title,
      skill: cls.skill,
      status: cls.status,
      enrollmentMode: cls.enrollment_mode,
      orgName: cls.organizations?.name ?? null,
      isHomeStudio: cls.is_home_studio,
      rateLabel: formatClassRate(
        cls.rate_amount,
        cls.rate_currency,
        cls.rate_unit,
      ),
      locationLabel: formatLocationType(cls.location_type),
      sessions: cls.class_sessions,
      students: [...studentsMap.values()].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      ),
      attendanceBySession,
    };
  });

  const canPost =
    profile.approval_status === "approved" && profile.onboarding_completed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Personal classes
        </h1>
        <p className="mt-1 text-muted-foreground">
          Classes you create and run on your own.
        </p>
      </div>
      <HomeStudioClassForm canPost={canPost} />
      <ClassesManager classes={classData} />
    </div>
  );
}
