import type { LinkedStudent } from "@/components/org/students-panel";
import type { PendingStudentInvite } from "@/components/org/students-panel";
import { createClient } from "@/lib/supabase/server";
import { slotsFromProposed } from "@/lib/week-slots";
import type {
  Batch,
  ClassRow,
  ClassSession,
} from "@/types/database";

export type SchoolClass = ClassRow & {
  sessions: ClassSession[];
  teacher: { profiles: { full_name: string } | null } | null;
};

export async function loadSchoolBatches(
  organizationId: string,
): Promise<Batch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("batches")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function loadSchoolStudents(
  organizationId: string,
): Promise<LinkedStudent[]> {
  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("batches")
    .select("id, name")
    .eq("organization_id", organizationId);

  const batchMap = Object.fromEntries((batches ?? []).map((b) => [b.id, b]));

  const { data: studentLinks } = await supabase
    .from("student_links")
    .select("id, student_profile_id, batch_id, created_at")
    .eq("organization_id", organizationId)
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

  return (studentLinks ?? []).map((link) => ({
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
    batch: link.batch_id
      ? { name: batchMap[link.batch_id]?.name ?? "" }
      : null,
  }));
}

export async function loadSchoolPendingStudentInvites(
  organizationId: string,
): Promise<PendingStudentInvite[]> {
  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("batches")
    .select("id, name")
    .eq("organization_id", organizationId);

  const batchMap = Object.fromEntries((batches ?? []).map((b) => [b.id, b]));

  const { data: requests } = await supabase
    .from("student_link_requests")
    .select("id, student_profile_id, student_email, batch_id, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "requested")
    .order("created_at", { ascending: false });

  const studentIds = (requests ?? [])
    .map((r) => r.student_profile_id)
    .filter((id): id is string => Boolean(id));
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

  return (requests ?? []).map((request) => {
    const profile = request.student_profile_id
      ? profileMap[request.student_profile_id]
      : null;
    return {
      id: request.id,
      student_profile_id: request.student_profile_id,
      student_email: request.student_email,
      batch_id: request.batch_id,
      created_at: request.created_at,
      student: profile
        ? {
            full_name: profile.full_name,
            email: profile.email,
          }
        : {
            full_name: "Pending signup",
            email: request.student_email,
          },
      batch: request.batch_id
        ? { name: batchMap[request.batch_id]?.name ?? "" }
        : null,
    };
  });
}

async function loadSessionsByClass(
  classIds: string[],
): Promise<Record<string, ClassSession[]>> {
  const sessionsByClass: Record<string, ClassSession[]> = {};
  if (classIds.length === 0) return sessionsByClass;

  const supabase = await createClient();
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

  return sessionsByClass;
}

export async function loadSchoolClasses(
  organizationId: string,
): Promise<SchoolClass[]> {
  const supabase = await createClient();

  let { data: classRows } = await supabase
    .from("classes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const classIds = (classRows ?? []).map((c) => c.id);
  let sessionsByClass = await loadSessionsByClass(classIds);

  // Ensure accepted classes with requested times get real calendar sessions.
  const needsSessions = (classRows ?? []).filter(
    (cls) =>
      cls.status === "accepted" &&
      (sessionsByClass[cls.id] ?? []).length === 0 &&
      Boolean(slotsFromProposed(cls)),
  );

  if (needsSessions.length > 0) {
    await Promise.all(
      needsSessions.map((cls) =>
        supabase.rpc("create_sessions_from_proposed_slots", {
          p_class_id: cls.id,
        }),
      ),
    );

    const refreshed = await supabase
      .from("classes")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    classRows = refreshed.data;
    sessionsByClass = await loadSessionsByClass(
      (classRows ?? []).map((c) => c.id),
    );
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

  return (classRows ?? []).map((cls) => ({
    ...cls,
    sessions: sessionsByClass[cls.id] ?? [],
    teacher: cls.teacher_id
      ? { profiles: { full_name: teacherNameMap[cls.teacher_id] ?? "Teacher" } }
      : null,
  }));
}

export async function loadSchoolNotifyClasses(
  organizationId: string,
): Promise<{ id: string; title: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, title")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
