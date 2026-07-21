"use server";

import { revalidatePath } from "next/cache";

import { assertOrgApproved } from "@/lib/orgs";
import { getCurrentOrganization } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type AcademyActionState = {
  error?: string;
  success?: boolean;
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
  const locationType = (formData.get("location_type") as string)?.trim() || "at_org";
  const rateRaw = (formData.get("rate_amount") as string)?.trim();
  const rateUnit = (formData.get("rate_unit") as string)?.trim() || "session";
  const maxRaw = (formData.get("max_students") as string)?.trim();
  const recurringWeeks = parseInt(formData.get("recurring_weeks") as string, 10) || 0;

  if (!title || !skill || !startsAt || !endsAt) {
    return { error: "Title, skill, and session times are required." };
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
