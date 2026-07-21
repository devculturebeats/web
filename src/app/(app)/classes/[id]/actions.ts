"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ClassLifecycle, SessionScope } from "@/types/database";

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

function revalidateClass(classId: string) {
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/teacher/classes");
  revalidatePath("/school");
  revalidatePath("/academy");
  revalidatePath("/dashboard");
  revalidatePath("/student/browse");
  revalidatePath("/student");
}

export async function addNote(
  classId: string,
  body: string,
): Promise<ClassDetailActionState> {
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
): Promise<ClassDetailActionState> {
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

  const { error } = await supabase.rpc("cancel_sessions_scoped", {
    p_session_id: sessionId,
    p_scope: scope,
  });

  if (error) return { error: error.message };

  if (session?.class_id) revalidateClass(session.class_id);
  return { success: true };
}

export async function updateSessionStatus(
  sessionId: string,
  status: ClassLifecycle,
): Promise<ClassDetailActionState> {
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.rpc("cancel_class", {
    p_class_id: classId,
    p_reason: reason?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidateClass(classId);
  return { success: true };
}
