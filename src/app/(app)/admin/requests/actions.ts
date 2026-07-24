"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { slotsFromProposed } from "@/lib/week-slots";
import type { TeacherMatch } from "@/types/database";

export type AdminActionState = {
  error?: string;
  success?: boolean;
  matches?: TeacherMatch[];
  conflicts?: string[];
  warning?: string;
  teachers?: {
    id: string;
    full_name: string;
    primary_skill: string | null;
  }[];
};

async function requireSuperadmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "superadmin") {
    return { error: "Not allowed." as const, supabase: null };
  }
  const supabase = await createClient();
  return { error: null, supabase };
}

export async function matchTeachersForSchoolNeed(
  classId: string,
): Promise<AdminActionState> {
  const gate = await requireSuperadmin();
  if (gate.error || !gate.supabase) {
    return { error: gate.error ?? "Not allowed." };
  }

  const { data: cls, error } = await gate.supabase
    .from("classes")
    .select(
      `
      id,
      skill,
      proposed_slots,
      proposed_day_of_week,
      proposed_start_time,
      proposed_end_time,
      organizations!inner ( type, city )
    `,
    )
    .eq("id", classId)
    .single();

  if (error || !cls) return { error: error?.message ?? "Class not found." };

  const org = (
    Array.isArray(cls.organizations) ? cls.organizations[0] : cls.organizations
  ) as { type: string; city: string | null } | null;

  if (org?.type !== "school") {
    return { error: "Only school needs are matched here." };
  }

  const skill = cls.skill?.trim();
  if (!skill) return { error: "This request has no skill." };

  const slots = slotsFromProposed(cls);
  if (!slots || slots.length === 0) {
    return { error: "This request has no proposed times." };
  }

  let intersection: Map<string, TeacherMatch> | null = null;

  for (const slot of slots) {
    const { data, error: matchError } = await gate.supabase.rpc(
      "match_teachers_for_slot",
      {
        p_skill: skill,
        p_day_of_week: slot.day,
        p_start_time: slot.start,
        p_end_time: slot.end,
        p_city: org.city,
      },
    );

    if (matchError) return { error: matchError.message };

    const byTeacher = new Map<string, TeacherMatch>();
    for (const match of data ?? []) {
      byTeacher.set(match.teacher_id, match);
    }

    if (intersection == null) {
      intersection = byTeacher;
    } else {
      for (const teacherId of [...intersection.keys()]) {
        if (!byTeacher.has(teacherId)) intersection.delete(teacherId);
      }
    }
    if (intersection.size === 0) break;
  }

  return {
    success: true,
    matches: intersection ? [...intersection.values()] : [],
  };
}

export async function searchTeachersByName(
  query: string,
): Promise<AdminActionState> {
  const gate = await requireSuperadmin();
  if (gate.error || !gate.supabase) {
    return { error: gate.error ?? "Not allowed." };
  }

  const q = query.trim();
  if (q.length < 2) return { success: true, teachers: [] };

  const { data, error } = await gate.supabase
    .from("teachers")
    .select(
      "id, primary_skill, profiles!inner(full_name, approval_status, role)",
    )
    .eq("profiles.role", "teacher")
    .eq("profiles.approval_status", "approved")
    .ilike("profiles.full_name", `%${q}%`)
    .limit(20);

  if (error) return { error: error.message };

  const teachers = (data ?? []).map((row) => {
    const profile = row.profiles as
      | { full_name: string }
      | { full_name: string }[]
      | null;
    const p = Array.isArray(profile) ? profile[0] : profile;
    return {
      id: row.id,
      full_name: p?.full_name ?? "Teacher",
      primary_skill: row.primary_skill,
    };
  });

  return { success: true, teachers };
}

export async function assignTeacherToSchoolNeed(
  classId: string,
  teacherId: string,
  options?: { force?: boolean; message?: string; replacement?: boolean },
): Promise<AdminActionState> {
  const gate = await requireSuperadmin();
  if (gate.error || !gate.supabase) {
    return { error: gate.error ?? "Not allowed." };
  }

  const { data: cls, error } = await gate.supabase
    .from("classes")
    .select(
      `
      *,
      organizations!inner ( type )
    `,
    )
    .eq("id", classId)
    .single();

  if (error || !cls) return { error: error?.message ?? "Class not found." };

  const org = (
    Array.isArray(cls.organizations) ? cls.organizations[0] : cls.organizations
  ) as { type: string } | null;

  if (org?.type !== "school") {
    return { error: "Only school needs can be assigned here." };
  }

  if (
    cls.status !== "requested" &&
    !options?.replacement &&
    !cls.needs_rematch
  ) {
    return { error: "This class is no longer awaiting assignment." };
  }

  const isReplacement = Boolean(options?.replacement || cls.needs_rematch);

  if (
    isReplacement &&
    !["requested", "accepted", "scheduled", "postponed"].includes(cls.status)
  ) {
    return { error: "This class cannot be rematched." };
  }

  const slots = slotsFromProposed(cls) ?? [];
  if (!options?.force) {
    for (const slot of slots) {
      const { data: conflicts } = await gate.supabase.rpc(
        "find_availability_conflicts",
        {
          p_teacher_id: teacherId,
          p_day_of_week: slot.day,
          p_start_time: slot.start,
          p_end_time: slot.end,
        },
      );
      if (conflicts && conflicts.length > 0) {
        return {
          error:
            "Teacher has a conflict. Confirm force request if you still want to send it.",
          conflicts: [
            `${slot.start.slice(0, 5)}–${slot.end.slice(0, 5)}`,
          ],
          warning: "Availability conflict detected.",
        };
      }
    }
  }

  const { data: existing } = await gate.supabase
    .from("class_requests")
    .select("id")
    .eq("class_id", classId)
    .eq("teacher_id", teacherId)
    .eq("status", "requested")
    .maybeSingle();

  if (existing) {
    return { error: "A request is already open for this teacher." };
  }

  const requestMessage =
    options?.message ||
    (isReplacement
      ? options?.force
        ? "Replacement assigned by CultureBeats (forced despite availability)."
        : "Replacement assigned by CultureBeats."
      : options?.force
        ? "Assigned by CultureBeats (forced despite availability)."
        : "Assigned by CultureBeats.");

  const { data: requestRow, error: requestError } = await gate.supabase
    .from("class_requests")
    .insert({
      class_id: classId,
      teacher_id: teacherId,
      status: "requested",
      request_kind: "assign",
      message: requestMessage,
      proposed_day_of_week: cls.proposed_day_of_week,
      proposed_start_time: cls.proposed_start_time,
      proposed_end_time: cls.proposed_end_time,
      proposed_slots: cls.proposed_slots,
      recurrence_mode: cls.recurrence_mode,
      recurrence_until: cls.recurrence_until,
    })
    .select("id")
    .single();

  if (requestError || !requestRow) {
    return { error: requestError?.message ?? "Failed to create request." };
  }

  if (isReplacement || cls.needs_rematch) {
    await gate.supabase
      .from("classes")
      .update({ needs_rematch: false, rematch_reason: null })
      .eq("id", classId);
  }

  revalidatePath("/admin/requests");
  revalidatePath("/teacher/requests");
  revalidatePath("/school");
  revalidatePath("/school/classes");
  revalidatePath(`/classes/${classId}`);

  return { success: true };
}
