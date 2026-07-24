"use server";

import { revalidatePath } from "next/cache";

import { rejectIfUnapprovedTeacher } from "@/lib/auth/teacher-gate";
import { createClient } from "@/lib/supabase/server";
import type {
  ClassLifecycle,
  SessionOutcome,
  SessionScope,
} from "@/types/database";

export type ClassDetailActionState = {
  error?: string;
  success?: boolean;
};

const SESSION_STATUSES: ClassLifecycle[] = [
  "scheduled",
  "postponed",
  "completed",
  "cancelled",
];

const SESSION_OUTCOMES: SessionOutcome[] = [
  "held",
  "teacher_no_show",
  "student_no_show",
];

async function guardUnapprovedTeacher(): Promise<ClassDetailActionState | null> {
  const error = await rejectIfUnapprovedTeacher();
  return error ? { error } : null;
}

function revalidateClass(classId: string) {
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/teacher/classes");
  revalidatePath("/school");
  revalidatePath("/school/classes");
  revalidatePath("/school/notify");
  revalidatePath("/academy");
  revalidatePath("/admin/requests");
  revalidatePath("/teacher/requests");
  revalidatePath("/dashboard");
  revalidatePath("/student/browse");
  revalidatePath("/student");
}

async function addLifecycleNote(
  classId: string,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("class_notes").insert({
    class_id: classId,
    author_id: user.id,
    body: trimmed,
  });
}

export async function addNote(
  classId: string,
  body: string,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const trimmed = body.trim();
  if (!trimmed) return { error: "Note cannot be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("class_notes").insert({
    class_id: classId,
    author_id: user.id,
    body: trimmed,
  });

  if (error) return { error: error.message };

  revalidateClass(classId);
  return { success: true };
}

export async function deleteNote(
  noteId: string,
  classId: string,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { error } = await supabase.from("class_notes").delete().eq("id", noteId);

  if (error) return { error: error.message };

  revalidateClass(classId);
  return { success: true };
}

export async function postponeSessionTo(
  sessionId: string,
  startsAt: string,
  endsAt: string,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!startsAt || !endsAt) {
    return { error: "Choose when to postpone to." };
  }

  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("id", sessionId)
    .maybeSingle();

  const { error } = await supabase.rpc("reschedule_session", {
    p_session_id: sessionId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_scope: "one",
  });

  if (error) return { error: error.message };

  if (session?.class_id) revalidateClass(session.class_id);
  return { success: true };
}

export async function rescheduleSession(
  sessionId: string,
  startsAt: string,
  endsAt: string,
  scope: SessionScope = "one",
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!startsAt || !endsAt) {
    return { error: "Start and end times are required." };
  }

  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("id", sessionId)
    .maybeSingle();

  const { error } = await supabase.rpc("reschedule_session", {
    p_session_id: sessionId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_scope: scope,
  });

  if (error) return { error: error.message };

  if (session?.class_id) revalidateClass(session.class_id);
  return { success: true };
}

export async function cancelSessionsScoped(
  sessionId: string,
  scope: SessionScope = "one",
  reason?: string | null,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id, starts_at")
    .eq("id", sessionId)
    .maybeSingle();

  const trimmedReason = reason?.trim() || null;

  const { error } = await supabase.rpc("cancel_sessions_scoped", {
    p_session_id: sessionId,
    p_scope: scope,
    p_reason: trimmedReason,
  });

  if (error) return { error: error.message };

  if (session?.class_id) {
    const when = session.starts_at
      ? new Date(session.starts_at).toLocaleString()
      : "session";
    const note =
      scope === "series"
        ? `Cancelled this and following sessions${trimmedReason ? `: ${trimmedReason}` : "."}`
        : `Cancelled session (${when})${trimmedReason ? `: ${trimmedReason}` : "."}`;
    await addLifecycleNote(session.class_id, note);
    revalidateClass(session.class_id);
  }
  return { success: true };
}

export async function markSessionOutcome(
  sessionId: string,
  outcome: SessionOutcome,
  reason?: string | null,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!SESSION_OUTCOMES.includes(outcome)) {
    return { error: "Invalid session outcome." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id, starts_at")
    .eq("id", sessionId)
    .maybeSingle();

  const trimmedReason = reason?.trim() || null;

  if (session?.starts_at && outcome === "held") {
    const startsAt = new Date(session.starts_at).getTime();
    if (Number.isFinite(startsAt) && startsAt > Date.now() + 15 * 60 * 1000) {
      return {
        error:
          "This session hasn’t started yet. Mark it held after the class time.",
      };
    }
  }

  const { error } = await supabase.rpc("mark_session_outcome", {
    p_session_id: sessionId,
    p_outcome: outcome,
    p_reason: trimmedReason,
  });

  if (error) return { error: error.message };

  if (session?.class_id) {
    const labels: Record<SessionOutcome, string> = {
      held: "Session held",
      teacher_no_show: "Teacher no-show",
      student_no_show: "Student no-show",
    };
    const when = session.starts_at
      ? new Date(session.starts_at).toLocaleString()
      : "session";
    await addLifecycleNote(
      session.class_id,
      `${labels[outcome]} (${when})${trimmedReason ? `: ${trimmedReason}` : "."}`,
    );
    revalidateClass(session.class_id);
  }
  return { success: true };
}

export type ReplacementCandidate = {
  id: string;
  name: string;
  primarySkill: string | null;
};

export async function listReplacementTeachers(
  classId: string,
): Promise<ClassDetailActionState & { teachers?: ReplacementCandidate[] }> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: cls } = await supabase
    .from("classes")
    .select("id, teacher_id, organization_id, organizations (id, type)")
    .eq("id", classId)
    .maybeSingle();

  if (!cls?.organization_id) {
    return { error: "This class has no organization." };
  }

  const org = (
    Array.isArray(cls.organizations) ? cls.organizations[0] : cls.organizations
  ) as { id: string; type: string } | null;

  if (!org) return { error: "Organization not found." };

  if (org.type === "academy") {
    const { data, error } = await supabase
      .from("teacher_links")
      .select(
        `
        teacher_id,
        teachers (
          id,
          primary_skill,
          profiles (full_name)
        )
      `,
      )
      .eq("organization_id", org.id);

    if (error) return { error: error.message };

    const teachers = (data ?? [])
      .map((row) => {
        const teacher = (
          Array.isArray(row.teachers) ? row.teachers[0] : row.teachers
        ) as {
          id: string;
          primary_skill: string | null;
          profiles: { full_name: string } | { full_name: string }[] | null;
        } | null;
        if (!teacher || teacher.id === cls.teacher_id) return null;
        const profile = Array.isArray(teacher.profiles)
          ? teacher.profiles[0]
          : teacher.profiles;
        return {
          id: teacher.id,
          name: profile?.full_name?.trim() || "Teacher",
          primarySkill: teacher.primary_skill,
        };
      })
      .filter((row): row is ReplacementCandidate => !!row)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, teachers };
  }

  // Schools: CultureBeats admin rematches from the wider teacher pool.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "superadmin") {
    return {
      error: "School rematches are handled by CultureBeats admin.",
      teachers: [],
    };
  }

  const { data, error } = await supabase
    .from("teachers")
    .select("id, primary_skill, profiles (full_name)")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return { error: error.message };

  const teachers = (data ?? [])
    .filter((row) => row.id !== cls.teacher_id)
    .map((row) => {
      const profileRow = (
        Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      ) as { full_name: string } | null;
      return {
        id: row.id,
        name: profileRow?.full_name?.trim() || "Teacher",
        primarySkill: row.primary_skill,
      };
    });

  return { success: true, teachers };
}

export async function requestTeacherReplacement(
  classId: string,
  teacherId: string,
  reason?: string | null,
  options?: { direct?: boolean },
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!teacherId) return { error: "Choose a teacher." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const trimmedReason = reason?.trim() || null;
  const requireConsent = !options?.direct;

  const { error } = await supabase.rpc("replace_class_teacher", {
    p_class_id: classId,
    p_new_teacher_id: teacherId,
    p_reason: trimmedReason,
    p_require_consent: requireConsent,
  });

  if (error) return { error: error.message };

  await addLifecycleNote(
    classId,
    options?.direct
      ? `Teacher replaced directly${trimmedReason ? `: ${trimmedReason}` : "."}`
      : `Replacement request sent${trimmedReason ? `: ${trimmedReason}` : "."}`,
  );

  revalidateClass(classId);
  return { success: true };
}

export async function requestSchoolRematch(
  classId: string,
  reason?: string | null,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const trimmedReason = reason?.trim() || null;

  const { error } = await supabase.rpc("request_school_rematch", {
    p_class_id: classId,
    p_reason: trimmedReason,
  });

  if (error) return { error: error.message };

  await addLifecycleNote(
    classId,
    `Rematch requested from CultureBeats${trimmedReason ? `: ${trimmedReason}` : "."}`,
  );

  revalidateClass(classId);
  return { success: true };
}

export async function updateSessionStatus(
  sessionId: string,
  status: ClassLifecycle,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!SESSION_STATUSES.includes(status)) {
    return { error: "Invalid session status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("id", sessionId)
    .maybeSingle();

  const { error } = await supabase.rpc("update_session_status", {
    p_session_id: sessionId,
    p_status: status,
  });

  if (error) return { error: error.message };

  if (session?.class_id) revalidateClass(session.class_id);
  return { success: true };
}

export type AttendanceRecord = {
  studentProfileId: string;
  present: boolean;
};

export async function markAttendance(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (records.length === 0) {
    return { error: "No attendance records provided." };
  }

  const { data: session } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("id", sessionId)
    .maybeSingle();

  const rows = records.map((record) => ({
    session_id: sessionId,
    student_profile_id: record.studentProfileId,
    present: record.present,
    marked_by: user.id,
    marked_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,student_profile_id" });

  if (error) return { error: error.message };

  if (session?.class_id) revalidateClass(session.class_id);
  return { success: true };
}

export async function scheduleClassSessions(
  classId: string,
  startsAt: string,
  endsAt: string,
  recurringWeeks = 0,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  if (!startsAt || !endsAt) {
    return { error: "Choose when the first meeting starts and ends." };
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.rpc("create_class_sessions", {
    p_class_id: classId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_recurring_weeks: Math.min(Math.max(recurringWeeks, 0), 8),
  });

  if (error) return { error: error.message };

  revalidateClass(classId);
  return { success: true };
}

export async function cancelClass(
  classId: string,
  reason?: string | null,
): Promise<ClassDetailActionState> {
  const blocked = await guardUnapprovedTeacher();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const trimmedReason = reason?.trim() || null;

  const { error } = await supabase.rpc("cancel_class", {
    p_class_id: classId,
    p_reason: trimmedReason,
  });

  if (error) return { error: error.message };

  await addLifecycleNote(
    classId,
    `Class cancelled${trimmedReason ? `: ${trimmedReason}` : "."}`,
  );

  revalidateClass(classId);
  return { success: true };
}
