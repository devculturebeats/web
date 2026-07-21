import { redirect } from "next/navigation";

import { SchoolPortal, type SchoolClass } from "@/components/school/school-portal";
import type { LinkedStudent } from "@/components/org/students-panel";
import type { AuditLogWithActor } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/profiles";
import { getCurrentOrganization } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import type { ClassSession } from "@/types/database";

export default async function SchoolPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "school_admin") redirect("/dashboard");

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("batches")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const batchMap = Object.fromEntries((batches ?? []).map((b) => [b.id, b]));

  const { data: studentLinks } = await supabase
    .from("student_links")
    .select("id, student_profile_id, batch_id, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const studentIds = (studentLinks ?? []).map((l) => l.student_profile_id);
  const { data: studentProfiles } =
    studentIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", studentIds)
      : { data: [] };

  const profileMap = Object.fromEntries(
    (studentProfiles ?? []).map((p) => [p.id, p]),
  );

  const students: LinkedStudent[] = (studentLinks ?? []).map((link) => ({
    id: link.id,
    student_profile_id: link.student_profile_id,
    batch_id: link.batch_id,
    created_at: link.created_at,
    student: profileMap[link.student_profile_id] ?? null,
    batch: link.batch_id ? { name: batchMap[link.batch_id]?.name ?? "" } : null,
  }));

  const { data: classRows } = await supabase
    .from("classes")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const classIds = (classRows ?? []).map((c) => c.id);
  const sessionsByClass: Record<string, ClassSession[]> = {};

  if (classIds.length > 0) {
    const { data: sessions } = await supabase
      .from("class_sessions")
      .select("*")
      .in("class_id", classIds)
      .order("starts_at", { ascending: true });

    for (const session of sessions ?? []) {
      if (!sessionsByClass[session.class_id]) {
        sessionsByClass[session.class_id] = [];
      }
      sessionsByClass[session.class_id].push(session);
    }
  }

  const teacherIds = [
    ...new Set(
      (classRows ?? [])
        .map((c) => c.teacher_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const teacherNameMap: Record<string, string> = {};
  if (teacherIds.length > 0) {
    const { data: teachers } = await supabase
      .from("teachers")
      .select("id, profile_id")
      .in("id", teacherIds);

    const profileIds = (teachers ?? []).map((t) => t.profile_id);
    const { data: teacherProfiles } =
      profileIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", profileIds)
        : { data: [] };

    const teacherProfileMap = Object.fromEntries(
      (teacherProfiles ?? []).map((p) => [p.id, p.full_name]),
    );

    for (const teacher of teachers ?? []) {
      teacherNameMap[teacher.id] =
        teacherProfileMap[teacher.profile_id] ?? "Teacher";
    }
  }

  const classes: SchoolClass[] = (classRows ?? []).map((cls) => ({
    ...cls,
    sessions: sessionsByClass[cls.id] ?? [],
    teacher: cls.teacher_id
      ? { profiles: { full_name: teacherNameMap[cls.teacher_id] ?? "Teacher" } }
      : null,
  }));

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles!audit_logs_actor_id_fkey(full_name, email)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <SchoolPortal
      org={org}
      batches={batches ?? []}
      students={students}
      classes={classes}
      auditLogs={(auditLogs ?? []) as AuditLogWithActor[]}
    />
  );
}
