import { redirect } from "next/navigation";

import {
  AcademyPortal,
  type AcademyClass,
  type ApprovedTeacher,
} from "@/components/academy/academy-portal";
import type {
  LinkedAcademyTeacher,
  PendingTeacherInvite,
} from "@/components/academy/academy-teachers-panel";
import type {
  LinkedStudent,
  PendingStudentInvite,
} from "@/components/org/students-panel";
import type { AuditLogWithActor } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/profiles";
import { getCurrentOrganization } from "@/lib/orgs";
import { loadSchoolPendingStudentInvites } from "@/lib/school/data";
import { createClient } from "@/lib/supabase/server";
import type { ClassSession } from "@/types/database";

export default async function AcademyPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "academy_admin") redirect("/dashboard");

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
          .select("id, full_name, email, username")
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
    student: profileMap[link.student_profile_id]
      ? {
          full_name: profileMap[link.student_profile_id].full_name,
          email: profileMap[link.student_profile_id].email,
          username: profileMap[link.student_profile_id].username,
        }
      : null,
    batch: link.batch_id ? { name: batchMap[link.batch_id]?.name ?? "" } : null,
  }));

  const pendingInvites: PendingStudentInvite[] =
    await loadSchoolPendingStudentInvites(org.id);

  const { data: teacherLinks } = await supabase
    .from("teacher_links")
    .select("id, teacher_id, teacher_profile_id, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const memberTeacherIds = (teacherLinks ?? []).map((l) => l.teacher_id);
  const memberProfileIds = (teacherLinks ?? []).map(
    (l) => l.teacher_profile_id,
  );

  const { data: memberTeacherRows } =
    memberTeacherIds.length > 0
      ? await supabase
          .from("teachers")
          .select("id, profile_id, primary_skill, secondary_skills, lookup_code")
          .in("id", memberTeacherIds)
      : { data: [] };

  const { data: memberProfiles } =
    memberProfileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", memberProfileIds)
      : { data: [] };

  const memberTeacherMap = Object.fromEntries(
    (memberTeacherRows ?? []).map((t) => [t.id, t]),
  );
  const memberProfileMap = Object.fromEntries(
    (memberProfiles ?? []).map((p) => [p.id, p]),
  );

  const linkedTeachers: LinkedAcademyTeacher[] = (teacherLinks ?? []).map(
    (link) => {
      const teacher = memberTeacherMap[link.teacher_id];
      const person = memberProfileMap[link.teacher_profile_id];
      return {
        id: link.id,
        teacher_id: link.teacher_id,
        teacher_profile_id: link.teacher_profile_id,
        created_at: link.created_at,
        teacher: person
          ? {
              full_name: person.full_name,
              email: person.email,
              phone: person.phone,
              lookup_code: teacher?.lookup_code ?? "",
              primary_skill: teacher?.primary_skill ?? null,
              secondary_skills: teacher?.secondary_skills ?? null,
            }
          : null,
      };
    },
  );

  const { data: pendingTeacherRows } = await supabase
    .from("teacher_link_requests")
    .select("id, teacher_email, teacher_profile_id, created_at")
    .eq("organization_id", org.id)
    .eq("status", "requested")
    .order("created_at", { ascending: false });

  const pendingTeacherProfileIds = (pendingTeacherRows ?? [])
    .map((r) => r.teacher_profile_id)
    .filter((id): id is string => Boolean(id));

  const { data: pendingTeacherProfiles } =
    pendingTeacherProfileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", pendingTeacherProfileIds)
      : { data: [] };

  const pendingTeacherProfileMap = Object.fromEntries(
    (pendingTeacherProfiles ?? []).map((p) => [p.id, p]),
  );

  const pendingTeacherInvites: PendingTeacherInvite[] = (
    pendingTeacherRows ?? []
  ).map((row) => ({
    id: row.id,
    teacher_email: row.teacher_email,
    teacher_profile_id: row.teacher_profile_id,
    created_at: row.created_at,
    teacher: row.teacher_profile_id
      ? pendingTeacherProfileMap[row.teacher_profile_id]
        ? {
            full_name:
              pendingTeacherProfileMap[row.teacher_profile_id].full_name,
            email: pendingTeacherProfileMap[row.teacher_profile_id].email,
          }
        : null
      : null,
  }));

  const { data: classRows } = await supabase
    .from("classes")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const classIds = (classRows ?? []).map((c) => c.id);
  let enrollmentCounts: Record<string, number> = {};
  const sessionsByClass: Record<string, ClassSession[]> = {};

  if (classIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("class_enrollments")
      .select("class_id")
      .in("class_id", classIds);

    enrollmentCounts = (enrollments ?? []).reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.class_id] = (acc[row.class_id] ?? 0) + 1;
        return acc;
      },
      {},
    );

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
    const { data: classTeachers } = await supabase
      .from("teachers")
      .select("id, profile_id")
      .in("id", teacherIds);

    const profileIds = (classTeachers ?? []).map((t) => t.profile_id);
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

    for (const teacher of classTeachers ?? []) {
      teacherNameMap[teacher.id] =
        teacherProfileMap[teacher.profile_id] ?? "Teacher";
    }
  }

  const classes: AcademyClass[] = (classRows ?? []).map((cls) => ({
    ...cls,
    enrollment_count: enrollmentCounts[cls.id] ?? 0,
    sessions: sessionsByClass[cls.id] ?? [],
    teacher: cls.teacher_id
      ? { profiles: { full_name: teacherNameMap[cls.teacher_id] ?? "Teacher" } }
      : null,
  }));

  const teachers: ApprovedTeacher[] = linkedTeachers.map((link) => ({
    id: link.teacher_id,
    primary_skill: link.teacher?.primary_skill ?? null,
    profiles: { full_name: link.teacher?.full_name ?? "Teacher" },
  }));

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles!audit_logs_actor_id_fkey(full_name, email)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AcademyPortal
      org={org}
      batches={batches ?? []}
      students={students}
      pendingInvites={pendingInvites}
      linkedTeachers={linkedTeachers}
      pendingTeacherInvites={pendingTeacherInvites}
      classes={classes}
      teachers={teachers}
      auditLogs={(auditLogs ?? []) as AuditLogWithActor[]}
    />
  );
}
