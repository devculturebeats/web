"use server";

import { revalidatePath } from "next/cache";

import { assertOrgApproved } from "@/lib/orgs";
import { getCurrentOrganization } from "@/lib/orgs";
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

function getNextOccurrence(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): { starts_at: string; ends_at: string } {
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = (dayOfWeek - currentDay + 7) % 7;

  const [sh, sm] = startTime.split(":").map(Number);
  const todayStart = new Date(now);
  todayStart.setHours(sh, sm, 0, 0);

  if (daysUntil === 0 && now >= todayStart) {
    daysUntil = 7;
  }

  const sessionDate = new Date(now);
  sessionDate.setDate(sessionDate.getDate() + daysUntil);

  const [eh, em] = endTime.split(":").map(Number);

  const startsAt = new Date(sessionDate);
  startsAt.setHours(sh, sm, 0, 0);

  const endsAt = new Date(sessionDate);
  endsAt.setHours(eh, em, 0, 0);

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
}

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

  const title = (formData.get("title") as string)?.trim();
  const skill = (formData.get("skill") as string)?.trim();
  const teacherId = formData.get("teacher_id") as string;
  const batchId = (formData.get("batch_id") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim() || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);

  if (!title || !skill || !teacherId) {
    return { error: "Title, skill, and teacher are required." };
  }
  if (slotsError) return { error: slotsError };

  const proposed = proposedSlotFields(slots);

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      batch_id: batchId,
      title,
      skill,
      status: "requested",
      enrollment_mode: "assigned",
      is_recurring: slots.length > 1,
      created_by: user.id,
      ...proposed,
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
    message,
    ...proposed,
  });

  if (requestError) return { error: requestError.message };

  revalidatePath("/school");
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

  const title = (formData.get("title") as string)?.trim();
  const skill = (formData.get("skill") as string)?.trim();
  const teacherId = formData.get("teacher_id") as string;
  const batchId = (formData.get("batch_id") as string)?.trim() || null;
  const { slots, error: slotsError } = parseRequestedSlots(formData);

  if (!title || !skill || !teacherId) {
    return { error: "All class details are required." };
  }
  if (slotsError) return { error: slotsError };

  const proposed = proposedSlotFields(slots);

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      batch_id: batchId,
      teacher_id: teacherId,
      title,
      skill,
      status: "accepted",
      enrollment_mode: "assigned",
      is_recurring: slots.length > 1,
      created_by: user.id,
      ...proposed,
    })
    .select("id")
    .single();

  if (classError || !classRow) {
    return { error: classError?.message ?? "Failed to create class." };
  }

  // First slot via RPC (status + linked-student enroll); remaining slots inserted.
  const firstOccurrence = getNextOccurrence(
    slots[0].day,
    slots[0].start,
    slots[0].end,
  );
  const { error: sessionError } = await supabase.rpc("create_class_sessions", {
    p_class_id: classRow.id,
    p_starts_at: firstOccurrence.starts_at,
    p_ends_at: firstOccurrence.ends_at,
    p_recurring_weeks: 0,
  });
  if (sessionError) return { error: sessionError.message };

  if (slots.length > 1) {
    const extraRows = slots.slice(1).map((slot) => {
      const { starts_at, ends_at } = getNextOccurrence(
        slot.day,
        slot.start,
        slot.end,
      );
      return {
        class_id: classRow.id,
        starts_at,
        ends_at,
        status: "scheduled" as const,
        series_id: crypto.randomUUID(),
      };
    });

    const { error: extraError } = await supabase
      .from("class_sessions")
      .insert(extraRows);
    if (extraError) return { error: extraError.message };

    const { error: classUpdateError } = await supabase
      .from("classes")
      .update({ is_recurring: true })
      .eq("id", classRow.id);
    if (classUpdateError) return { error: classUpdateError.message };
  }

  revalidatePath("/school");
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

  revalidatePath("/school");
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

  revalidatePath("/school");
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

  revalidatePath("/school");
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
  revalidatePath("/school");
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

  revalidatePath("/school");
  return { success: true };
}
