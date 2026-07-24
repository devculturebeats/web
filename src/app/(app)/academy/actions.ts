"use server";

import { revalidatePath } from "next/cache";

import {
  parseRecurrenceFromForm,
  recurrenceDbFields,
} from "@/lib/recurrence";
import { assertOrgApproved } from "@/lib/orgs";
import { getCurrentOrganization } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { parseWeekDays, weekSlotsToJson } from "@/lib/week-slots";
import type {
  AcademyMemberTeacher,
  DiscoverableTeacher,
} from "@/types/database";

export type AcademyActionState = {
  error?: string;
  success?: boolean;
  warning?: string;
  matches?: AcademyMemberTeacher[];
  discoveries?: DiscoverableTeacher[];
};

export async function createMarketplaceClass(
  formData: FormData,
): Promise<AcademyActionState> {
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
  const startsAt = formData.get("starts_at") as string;
  const endsAt = formData.get("ends_at") as string;
  const teacherId = (formData.get("teacher_id") as string)?.trim() || null;
  const batchId = (formData.get("batch_id") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const locationType =
    (formData.get("location_type") as string)?.trim() || "at_org";
  const rateRaw = (formData.get("rate_amount") as string)?.trim();
  const rateUnit = (formData.get("rate_unit") as string)?.trim() || "session";
  const maxRaw = (formData.get("max_students") as string)?.trim();
  const recurringWeeks =
    parseInt(formData.get("recurring_weeks") as string, 10) || 0;

  if (!title || !skill || !startsAt || !endsAt) {
    return { error: "Title, skill, and session times are required." };
  }

  if (teacherId) {
    const { data: membership } = await supabase
      .from("teacher_links")
      .select("id")
      .eq("organization_id", org.id)
      .eq("teacher_id", teacherId)
      .maybeSingle();
    if (!membership) {
      return {
        error:
          "You can only assign teachers who have joined your academy. Invite them from Discover teachers first.",
      };
    }
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

  const status = teacherId ? "accepted" : "scheduled";

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      batch_id: batchId,
      teacher_id: teacherId,
      title,
      skill,
      description,
      status,
      enrollment_mode: "self_enroll",
      is_home_studio: false,
      location_type: locationType,
      rate_amount: rateAmount,
      rate_currency: "INR",
      rate_unit: rateUnit,
      max_students: maxStudents,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      is_recurring: recurringWeeks > 0,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (classError || !classRow) {
    return { error: classError?.message ?? "Failed to create class." };
  }

  const { error: sessionError } = await supabase.rpc("create_class_sessions", {
    p_class_id: classRow.id,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_recurring_weeks: Math.min(Math.max(recurringWeeks, 0), 8),
  });

  if (sessionError) return { error: sessionError.message };

  revalidatePath("/academy");
  return { success: true };
}

export async function cancelClass(
  classId: string,
  reason?: string,
): Promise<AcademyActionState> {
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

  revalidatePath("/academy");
  return { success: true };
}

export async function rescheduleSession(
  sessionId: string,
  startsAt: string,
  endsAt: string,
  scope: "one" | "series" = "one",
): Promise<AcademyActionState> {
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
  revalidatePath("/academy");
  return { success: true };
}

export async function sendNotification(
  title: string,
  body: string,
  classIds: string[] | null,
): Promise<AcademyActionState> {
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

  revalidatePath("/academy");
  return { success: true };
}

export async function matchTeachersForAcademy(
  formData: FormData,
): Promise<AcademyActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") {
    return { error: "Only academies can find teachers directly." };
  }

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const name = (formData.get("name") as string)?.trim() || null;
  const skill = (formData.get("skill") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const slots = parseWeekDays(formData.get("week_days") as string | null);
  const filterFree = formData.get("filter_free") === "true";

  if (filterFree && (!slots || slots.length === 0)) {
    return { error: "Select at least one day and time to filter by free slots." };
  }

  const supabase = await createClient();

  if (!filterFree || !slots || slots.length === 0) {
    const { data, error } = await supabase.rpc("search_academy_member_teachers", {
      p_organization_id: org.id,
      p_name: name,
      p_skill: skill,
      p_email: email,
      p_phone: phone,
      p_day_of_week: null,
      p_start_time: null,
      p_end_time: null,
    });
    if (error) return { error: error.message };
    return { success: true, matches: data ?? [] };
  }

  let intersection: Map<string, AcademyMemberTeacher> | null = null;

  for (const slot of slots) {
    const { data, error: matchError } = await supabase.rpc(
      "search_academy_member_teachers",
      {
        p_organization_id: org.id,
        p_name: name,
        p_skill: skill,
        p_email: email,
        p_phone: phone,
        p_day_of_week: slot.day,
        p_start_time: slot.start,
        p_end_time: slot.end,
      },
    );
    if (matchError) return { error: matchError.message };

    const byTeacher = new Map<string, AcademyMemberTeacher>();
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

export async function requestTeacherForAcademy(
  formData: FormData,
): Promise<AcademyActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") {
    return { error: "Only academies can request teachers directly." };
  }

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
  const message = (formData.get("message") as string)?.trim() || null;
  const force = formData.get("force") === "true";
  const slots = parseWeekDays(formData.get("week_days") as string | null);
  const { value: recurrence, error: recurrenceError } =
    parseRecurrenceFromForm(formData);

  if (!skill || !teacherId) {
    return { error: "Skill and teacher are required." };
  }
  if (!slots || slots.length === 0) {
    return { error: "Select at least one day with a valid time slot." };
  }
  if (recurrenceError) return { error: recurrenceError };

  const { data: membership } = await supabase
    .from("teacher_links")
    .select("id")
    .eq("organization_id", org.id)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (!membership) {
    return {
      error:
        "This teacher is not part of your academy yet. Invite them from Discover teachers first.",
    };
  }

  if (!force) {
    for (const slot of slots) {
      const { data: conflicts } = await supabase.rpc(
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
            "Teacher may not be free. Use force request if you still want to send it.",
          warning: "Availability conflict detected.",
        };
      }
    }
  }

  const first = slots[0];
  const proposed = {
    proposed_day_of_week: first.day,
    proposed_start_time: first.start,
    proposed_end_time: first.end,
    proposed_slots: weekSlotsToJson(slots),
  };
  const recurrenceFields = recurrenceDbFields(recurrence);
  const classTitle = title || skill;

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .insert({
      organization_id: org.id,
      title: classTitle,
      skill,
      status: "requested",
      enrollment_mode: "self_enroll",
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

  const requestMessage =
    message?.trim() ||
    (force
      ? "Academy force request (may conflict with availability)."
      : "Academy teaching request.");

  const { data: requestRow, error: requestError } = await supabase
    .from("class_requests")
    .insert({
      class_id: classRow.id,
      teacher_id: teacherId,
      status: "requested",
      request_kind: "assign",
      message: requestMessage,
      ...proposed,
      ...recurrenceFields,
    })
    .select("id")
    .single();

  if (requestError || !requestRow) {
    return { error: requestError?.message ?? "Failed to create request." };
  }

  revalidatePath("/academy");
  revalidatePath("/teacher/requests");
  return { success: true };
}

export async function discoverTeachersForAcademy(
  formData: FormData,
): Promise<AcademyActionState & { discoveries?: DiscoverableTeacher[] }> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") {
    return { error: "Only academies can discover teachers." };
  }

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const query = (formData.get("query") as string)?.trim() || "";
  if (!query) {
    return { error: "Enter a teacher email or 6-digit teacher ID." };
  }

  const isLookupCode = /^[0-9]{6}$/.test(query);
  const isEmail = query.includes("@");
  if (!isLookupCode && !isEmail) {
    return {
      error: "Enter the teacher's full email or exact 6-digit teacher ID.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "search_discoverable_teachers_for_academy",
    {
      p_organization_id: org.id,
      p_email: isEmail ? query.toLowerCase() : null,
      p_lookup_code: isLookupCode ? query : null,
    },
  );

  if (error) return { error: error.message };
  return { success: true, discoveries: data ?? [] };
}

export async function inviteTeacherToAcademy(
  formData: FormData,
): Promise<AcademyActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") {
    return { error: "Only academies can invite teachers." };
  }

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const teacherIdInput = (formData.get("teacher_id") as string)?.trim() || null;
  const emailInput = (formData.get("email") as string)?.trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  let teacherId: string | null = teacherIdInput;
  let profileId: string | null = null;
  let email = emailInput || "";

  if (teacherId) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, profile_id, discoverable_by_academies")
      .eq("id", teacherId)
      .maybeSingle();

    if (!teacher) return { error: "Teacher not found." };
    if (!teacher.discoverable_by_academies) {
      return {
        error:
          "This teacher has turned off academy discovery and cannot be invited this way.",
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, role, approval_status, onboarding_completed")
      .eq("id", teacher.profile_id)
      .maybeSingle();

    if (!profile || profile.role !== "teacher") {
      return { error: "Teacher profile not found." };
    }
    if (
      profile.approval_status !== "approved" ||
      !profile.onboarding_completed
    ) {
      return { error: "This teacher is not available to invite yet." };
    }

    profileId = profile.id;
    email = profile.email.toLowerCase();
  } else if (email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, email")
      .eq("email", email)
      .maybeSingle();

    if (profile && profile.role !== "teacher") {
      return { error: "That email belongs to a non-teacher account." };
    }

    if (profile) {
      profileId = profile.id;
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id, discoverable_by_academies")
        .eq("profile_id", profile.id)
        .maybeSingle();
      teacherId = teacher?.id ?? null;
      if (teacher && !teacher.discoverable_by_academies) {
        return {
          error:
            "This teacher has turned off academy discovery and cannot be invited this way.",
        };
      }
    }
  } else {
    return { error: "Select a teacher or enter their email." };
  }

  if (profileId) {
    const { data: existingLink } = await supabase
      .from("teacher_links")
      .select("id")
      .eq("organization_id", org.id)
      .eq("teacher_profile_id", profileId)
      .maybeSingle();

    if (existingLink) {
      return { error: "This teacher is already part of your academy." };
    }
  }

  const { data: pending } = await supabase
    .from("teacher_link_requests")
    .select("id")
    .eq("organization_id", org.id)
    .eq("status", "requested")
    .ilike("teacher_email", email)
    .maybeSingle();

  if (pending) {
    return { error: "An invite is already waiting for this teacher." };
  }

  const { error } = await supabase.from("teacher_link_requests").insert({
    organization_id: org.id,
    teacher_id: teacherId,
    teacher_profile_id: profileId,
    teacher_email: email,
    status: "requested",
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "An invite is already waiting for this teacher." };
    }
    return { error: error.message };
  }

  revalidatePath("/academy");
  revalidatePath("/teacher/requests");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function cancelTeacherInvite(
  requestId: string,
): Promise<AcademyActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") return { error: "Not allowed." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_link_requests")
    .update({ status: "rejected", responded_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("organization_id", org.id)
    .eq("status", "requested");

  if (error) return { error: error.message };

  revalidatePath("/academy");
  return { success: true };
}

export async function removeAcademyTeacher(
  teacherId: string,
): Promise<AcademyActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };
  if (org.type !== "academy") return { error: "Not allowed." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_links")
    .delete()
    .eq("organization_id", org.id)
    .eq("teacher_id", teacherId);

  if (error) return { error: error.message };

  revalidatePath("/academy");
  return { success: true };
}
