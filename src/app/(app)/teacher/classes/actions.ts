"use server";

import { revalidatePath } from "next/cache";

import { requireApprovedTeacher } from "@/lib/auth/teacher-gate";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { ClassLifecycle } from "@/types/database";

export type ClassActionState = {
  error?: string;
  success?: boolean;
};

const SESSION_STATUSES: ClassLifecycle[] = [
  "scheduled",
  "postponed",
  "completed",
  "cancelled",
];

const LOCATION_TYPES = new Set(["home_studio", "online", "venue"]);
const RATE_UNITS = new Set(["hour", "session", "course"]);

type WeekDaySlot = {
  day: number;
  start: string;
  end: string;
};

function nextDateOnOrAfter(from: Date, dayOfWeek: number): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function combineLocalDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map((part) => parseInt(part, 10));
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function parseWeekDays(raw: string | null): WeekDaySlot[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WeekDaySlot[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const slots = parsed.filter(
      (slot) =>
        Number.isInteger(slot.day) &&
        slot.day >= 0 &&
        slot.day <= 6 &&
        typeof slot.start === "string" &&
        typeof slot.end === "string" &&
        slot.start < slot.end,
    );
    if (slots.length === 0) return null;

    // Reject overlapping times on the same weekday
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        if (slots[i].day !== slots[j].day) continue;
        if (slots[i].start < slots[j].end && slots[j].start < slots[i].end) {
          return null;
        }
      }
    }

    return slots;
  } catch {
    return null;
  }
}

export async function createHomeStudioClass(
  formData: FormData,
): Promise<ClassActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") {
    return { error: "Teacher profile not found." };
  }
  if (profile.approval_status !== "approved" || !profile.onboarding_completed) {
    return {
      error: "Your teacher profile must be approved before posting classes.",
    };
  }

  const teacherId = profile.teacher?.id;
  if (!teacherId) {
    return { error: "Complete your teacher profile first." };
  }

  const title = (formData.get("title") as string)?.trim();
  const skill = (formData.get("skill") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const startsFromRaw = (formData.get("starts_from") as string)?.trim();
  const locationType =
    (formData.get("location_type") as string)?.trim() || "home_studio";
  const locationNote = (formData.get("location_note") as string)?.trim() || null;
  const rateRaw = (formData.get("rate_amount") as string)?.trim();
  const rateUnit = (formData.get("rate_unit") as string)?.trim() || "hour";
  const maxRaw = (formData.get("max_students") as string)?.trim();
  const recurringWeeks = Math.min(
    Math.max(parseInt(formData.get("recurring_weeks") as string, 10) || 0, 0),
    8,
  );
  const weekDays = parseWeekDays(formData.get("week_days") as string | null);

  if (!title || !skill) {
    return { error: "Title and skill are required." };
  }
  if (!startsFromRaw) {
    return { error: "Choose when the first week starts." };
  }
  if (!weekDays || weekDays.length === 0) {
    return {
      error:
        "Select at least one day with start and end times. Slots on the same day can’t overlap.",
    };
  }
  if (!LOCATION_TYPES.has(locationType)) {
    return { error: "Invalid location type." };
  }
  if (!RATE_UNITS.has(rateUnit)) {
    return { error: "Invalid rate unit." };
  }

  const startsFrom = new Date(`${startsFromRaw}T00:00:00`);
  if (Number.isNaN(startsFrom.getTime())) {
    return { error: "Invalid start date." };
  }

  let rateAmount: number | null = null;
  if (rateRaw) {
    rateAmount = Number(rateRaw);
    if (!Number.isFinite(rateAmount) || rateAmount < 0) {
      return { error: "Rate must be a valid non-negative number." };
    }
  }

  let maxStudents: number | null = null;
  if (maxRaw) {
    maxStudents = parseInt(maxRaw, 10);
    if (!Number.isFinite(maxStudents) || maxStudents < 1) {
      return { error: "Capacity must be at least 1." };
    }
  }

  const sessionRows: {
    starts_at: string;
    ends_at: string;
    status: "scheduled";
    series_id: string;
  }[] = [];

  for (const slot of weekDays) {
    const seriesId = crypto.randomUUID();
    const firstOccurrence = nextDateOnOrAfter(startsFrom, slot.day);
    for (let week = 0; week <= recurringWeeks; week += 1) {
      const dayDate = new Date(firstOccurrence);
      dayDate.setDate(dayDate.getDate() + week * 7);
      const starts = combineLocalDateAndTime(dayDate, slot.start);
      const ends = combineLocalDateAndTime(dayDate, slot.end);
      if (ends <= starts) {
        return {
          error: "Each selected day needs an end time after the start time.",
        };
      }
      sessionRows.push({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        status: "scheduled",
        series_id: seriesId,
      });
    }
  }

  sessionRows.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const first = sessionRows[0];
  const last = sessionRows[sessionRows.length - 1];

  const supabase = await createClient();
  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: null,
      teacher_id: teacherId,
      title,
      skill,
      description,
      status: "scheduled",
      enrollment_mode: "self_enroll",
      is_home_studio: true,
      location_type: locationType,
      location_note: locationNote,
      rate_amount: rateAmount,
      rate_currency: "INR",
      rate_unit: rateUnit,
      max_students: maxStudents,
      starts_at: first.starts_at,
      ends_at: last.ends_at,
      is_recurring: recurringWeeks > 0 || weekDays.length > 1,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (classError || !classRow) {
    return { error: classError?.message ?? "Failed to create class." };
  }

  const { error: sessionError } = await supabase.from("class_sessions").insert(
    sessionRows.map((row) => ({
      class_id: classRow.id,
      ...row,
    })),
  );

  if (sessionError) {
    return { error: sessionError.message };
  }

  revalidatePath("/teacher/classes");
  revalidatePath("/dashboard");
  revalidatePath("/student/browse");
  revalidatePath(`/classes/${classRow.id}`);
  return { success: true };
}

export async function updateSessionStatus(
  sessionId: string,
  status: ClassLifecycle,
): Promise<ClassActionState> {
  if (!SESSION_STATUSES.includes(status)) {
    return { error: "Invalid session status." };
  }

  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_session_status", {
    p_session_id: sessionId,
    p_status: status,
  });

  if (error) return { error: error.message };

  revalidatePath("/teacher/classes");
  return { success: true };
}

export type AttendanceRecord = {
  studentProfileId: string;
  present: boolean;
};

export async function markAttendance(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<ClassActionState> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  if (records.length === 0) {
    return { error: "No attendance records provided." };
  }

  const rows = records.map((record) => ({
    session_id: sessionId,
    student_profile_id: record.studentProfileId,
    present: record.present,
    marked_by: gate.profile.id,
    marked_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,student_profile_id" });

  if (error) return { error: error.message };

  revalidatePath("/teacher/classes");
  return { success: true };
}

export async function postponeSessionTo(
  sessionId: string,
  startsAt: string,
  endsAt: string,
): Promise<ClassActionState> {
  if (!startsAt || !endsAt) {
    return { error: "Choose when to postpone to." };
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after start time." };
  }

  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
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

  if (session?.class_id) revalidatePath(`/classes/${session.class_id}`);
  revalidatePath("/teacher/classes");
  return { success: true };
}

export async function rescheduleSession(
  sessionId: string,
  startsAt: string,
  endsAt: string,
  scope: "one" | "series" = "one",
): Promise<ClassActionState> {
  if (!startsAt || !endsAt) {
    return { error: "Start and end times are required." };
  }

  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after start time." };
  }

  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
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

  if (session?.class_id) revalidatePath(`/classes/${session.class_id}`);
  revalidatePath("/teacher/classes");
  return { success: true };
}

export async function cancelClass(
  classId: string,
  reason?: string | null,
): Promise<ClassActionState> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_class", {
    p_class_id: classId,
    p_reason: reason?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/teacher/classes");
  return { success: true };
}
