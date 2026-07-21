"use server";

import { revalidatePath } from "next/cache";

import {
  parseRecurrenceFromForm,
  recurrenceDbFields,
} from "@/lib/recurrence";
import { assertOrgApproved } from "@/lib/orgs";
import { getCurrentOrganization } from "@/lib/orgs";
import { revalidateSchoolPaths } from "@/lib/school/revalidate";
import { createClient } from "@/lib/supabase/server";
import {
  parseWeekDays,
  weekSlotsToJson,
  type WeekDaySlot,
} from "@/lib/week-slots";
import type { ClassLifecycle, TeacherMatch } from "@/types/database";

export type SchoolActionState = {
  error?: string;
  success?: boolean;
  matches?: TeacherMatch[];
};

function parseRequestedSlots(formData: FormData): {
  slots: WeekDaySlot[];
  error?: string;
} {
  const slots = parseWeekDays(formData.get("week_days") as string | null);
  if (!slots || slots.length === 0) {
    return {
      slots: [],
      error: "Select at least one day with a valid time slot.",
    };
  }
  return { slots };
}

function proposedSlotFields(slots: WeekDaySlot[]) {
  const first = slots[0];
  return {
    proposed_day_of_week: first.day,
    proposed_start_time: first.start,
    proposed_end_time: first.end,
    proposed_slots: weekSlotsToJson(slots),
  };
}

export async function matchTeachersForSlot(
  formData: FormData,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const skill = (formData.get("skill") as string)?.trim();
  const city = (formData.get("city") as string)?.trim() || org.city || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);

  if (!skill) {
    return { error: "Skill is required." };
  }
  if (slotsError) return { error: slotsError };

  const supabase = await createClient();

  // Teachers must cover every requested weekly slot (skill + availability).
  let intersection: Map<string, TeacherMatch> | null = null;

  for (const slot of slots) {
    const { data, error } = await supabase.rpc("match_teachers_for_slot", {
      p_skill: skill,
      p_day_of_week: slot.day,
      p_start_time: slot.start,
      p_end_time: slot.end,
      p_city: city,
    });

    if (error) return { error: error.message };

    const byTeacher = new Map<string, TeacherMatch>();
    for (const match of data ?? []) {
      byTeacher.set(match.teacher_id, match);
    }

    if (intersection == null) {
      intersection = byTeacher;
    } else {
      for (const teacherId of [...intersection.keys()]) {
        if (!byTeacher.has(teacherId)) {
          intersection.delete(teacherId);
        }
      }
    }

    if (intersection.size === 0) break;
  }

  return {
    success: true,
    matches: intersection ? [...intersection.values()] : [],
  };
}

export async function requestTeacher(
  formData: FormData,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const title = (formData.get("title") as string)?.trim() || null;
  const skill = (formData.get("skill") as string)?.trim();
  const teacherId = formData.get("teacher_id") as string;
  const batchId = (formData.get("batch_id") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim() || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);
  const { value: recurrence, error: recurrenceError } =
    parseRecurrenceFromForm(formData);

  if (!skill || !teacherId) {
    return { error: "Skill and teacher are required." };
  }
  if (slotsError) return { error: slotsError };
  if (recurrenceError) return { error: recurrenceError };

  const proposed = proposedSlotFields(slots);
  const recurrenceFields = recurrenceDbFields(recurrence);
  const classTitle = title || skill;

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      batch_id: batchId,
      title: classTitle,
      skill,
      status: "requested",
      enrollment_mode: "assigned",
      is_recurring:
        recurrence.mode !== "once" || slots.length > 1,
      created_by: user.id,
      ...proposed,
      ...recurrenceFields,
    })
    .select("id")
    .single();

  if (classError || !classRow) {
    return { error: classError?.message ?? "Failed to create class." };
  }

  const { error: requestError } = await supabase.from("class_requests").insert({
    class_id: classRow.id,
    teacher_id: teacherId,
    status: "requested",
    request_kind: "assign",
    message,
    ...proposed,
    ...recurrenceFields,
  });

  if (requestError) return { error: requestError.message };

  revalidateSchoolPaths(["/school", "/school/classes", "/school/notify"]);
  return { success: true };
}

export async function assignTeacherDirectly(
  formData: FormData,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const title = (formData.get("title") as string)?.trim() || null;
  const skill = (formData.get("skill") as string)?.trim();
  const teacherId = formData.get("teacher_id") as string;
  const batchId = (formData.get("batch_id") as string)?.trim() || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);
  const { value: recurrence, error: recurrenceError } =
    parseRecurrenceFromForm(formData);

  if (!skill || !teacherId) {
    return { error: "Skill and teacher are required." };
  }
  if (slotsError) return { error: slotsError };
  if (recurrenceError) return { error: recurrenceError };

  const proposed = proposedSlotFields(slots);
  const recurrenceFields = recurrenceDbFields(recurrence);
  const classTitle = title || skill;

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      batch_id: batchId,
      teacher_id: teacherId,
      title: classTitle,
      skill,
      status: "accepted",
      enrollment_mode: "assigned",
      is_recurring: recurrence.mode !== "once" || slots.length > 1,
      created_by: user.id,
      ...proposed,
      ...recurrenceFields,
    })
    .select("id")
    .single();

  if (classError || !classRow) {
    return { error: classError?.message ?? "Failed to create class." };
  }

  const { error: sessionError } = await supabase.rpc(
    "create_sessions_from_proposed_slots",
    { p_class_id: classRow.id },
  );
  if (sessionError) return { error: sessionError.message };

  revalidateSchoolPaths(["/school", "/school/classes", "/school/notify"]);
  return { success: true };
}

export async function scheduleClassSessions(
  formData: FormData,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const classId = formData.get("class_id") as string;
  const startsAt = formData.get("starts_at") as string;
  const endsAt = formData.get("ends_at") as string;
  const recurringWeeks = parseInt(formData.get("recurring_weeks") as string, 10) || 0;

  if (!classId || !startsAt || !endsAt) {
    return { error: "Class and session times are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_class_sessions", {
    p_class_id: classId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_recurring_weeks: Math.min(Math.max(recurringWeeks, 0), 8),
  });

  if (error) return { error: error.message };

  revalidateSchoolPaths(["/school/classes", "/school/notify"]);
  return { success: true };
}

export async function scheduleFromProposedSlots(
  classId: string,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  if (!classId) return { error: "Class is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_sessions_from_proposed_slots", {
    p_class_id: classId,
  });

  if (error) return { error: error.message };

  revalidateSchoolPaths(["/school/classes", "/school/notify"]);
  return { success: true };
}

/** Ask the assigned teacher to approve a new weekly schedule / recurrence. */
export async function requestScheduleUpdate(
  formData: FormData,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const classId = formData.get("class_id") as string;
  const message = (formData.get("message") as string)?.trim() || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);
  const { value: recurrence, error: recurrenceError } =
    parseRecurrenceFromForm(formData);

  if (!classId) return { error: "Class is required." };
  if (slotsError) return { error: slotsError };
  if (recurrenceError) return { error: recurrenceError };

  const supabase = await createClient();
  const { data: cls, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, teacher_id, status")
    .eq("id", classId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (classError) return { error: classError.message };
  if (!cls) return { error: "Class not found." };
  if (!cls.teacher_id) {
    return { error: "This class has no teacher to request a schedule from." };
  }
  if (!["accepted", "scheduled"].includes(cls.status)) {
    return { error: "Schedule updates are only for accepted classes." };
  }

  const { data: openRequest } = await supabase
    .from("class_requests")
    .select("id")
    .eq("class_id", classId)
    .eq("status", "requested")
    .eq("request_kind", "schedule")
    .maybeSingle();

  if (openRequest) {
    return { error: "A schedule update is already waiting on the teacher." };
  }

  const proposed = proposedSlotFields(slots);
  const recurrenceFields = recurrenceDbFields(recurrence);

  const { error: requestError } = await supabase.from("class_requests").insert({
    class_id: classId,
    teacher_id: cls.teacher_id,
    status: "requested",
    request_kind: "schedule",
    message,
    ...proposed,
    ...recurrenceFields,
  });

  if (requestError) return { error: requestError.message };

  revalidateSchoolPaths(["/school/classes"]);
  revalidatePath("/teacher/requests");
  return { success: true };
}

export async function updateSessionStatus(
  sessionId: string,
  status: ClassLifecycle,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_session_status", {
    p_session_id: sessionId,
    p_status: status,
  });

  if (error) return { error: error.message };

  revalidateSchoolPaths(["/school/classes"]);
  return { success: true };
}

export async function cancelClass(
  classId: string,
  reason?: string,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_class", {
    p_class_id: classId,
    p_reason: reason?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidateSchoolPaths(["/school/classes", "/school/notify"]);
  return { success: true };
}

export async function rescheduleSession(
  sessionId: string,
  startsAt: string,
  endsAt: string,
  scope: "one" | "series" = "one",
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  if (!startsAt || !endsAt) {
    return { error: "Start and end times are required." };
  }

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
    p_scope: scope,
  });

  if (error) return { error: error.message };

  if (session?.class_id) revalidatePath(`/classes/${session.class_id}`);
  revalidateSchoolPaths(["/school/classes"]);
  return { success: true };
}

export async function sendNotification(
  title: string,
  body: string,
  classIds: string[] | null,
): Promise<SchoolActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  if (!trimmedTitle || !trimmedBody) {
    return { error: "Title and body are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_org_notification", {
    p_organization_id: org.id,
    p_title: trimmedTitle,
    p_body: trimmedBody,
    p_class_ids: classIds,
  });

  if (error) return { error: error.message };

  revalidateSchoolPaths(["/school/notify"]);
  return { success: true };
}
