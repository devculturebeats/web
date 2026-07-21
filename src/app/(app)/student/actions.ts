"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { StudentLink } from "@/types/database";

export type StudentActionState = {
  error?: string;
  success?: boolean;
};

function revalidateStudentPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/student/browse");
  revalidatePath("/student");
}

export async function completeStudentOnboarding(
  formData: FormData,
): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const fullName = (formData.get("full_name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();

  if (!fullName) {
    return { error: "Full name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: phone || null,
      onboarding_completed: true,
    })
    .eq("id", profile.id);

  if (error) return { error: error.message };

  revalidateStudentPaths();
  return { success: true };
}

export async function joinOrganization(
  organizationId: string,
): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("student_links").insert({
    student_profile_id: profile.id,
    organization_id: organizationId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You are already linked to this institution." };
    }
    return { error: error.message };
  }

  revalidateStudentPaths();
  return { success: true };
}

export async function enrollInClass(
  classId: string,
  sessionIds?: string[],
): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_in_open_class", {
    p_class_id: classId,
    p_session_ids:
      sessionIds && sessionIds.length > 0 ? sessionIds : undefined,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { error: "You are already enrolled in this class." };
    }
    return { error: error.message };
  }

  revalidateStudentPaths();
  revalidatePath(`/classes/${classId}`);
  return { success: true };
}

export async function leaveClass(classId: string): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("unenroll_from_open_class", {
    p_class_id: classId,
  });

  if (error) return { error: error.message };

  revalidateStudentPaths();
  revalidatePath(`/classes/${classId}`);
  return { success: true };
}

function linkMatchesClass(
  link: Pick<StudentLink, "organization_id" | "batch_id">,
  cls: { organization_id: string | null; batch_id: string | null },
): boolean {
  if (!cls.organization_id) return false;
  if (link.organization_id !== cls.organization_id) return false;
  if (link.batch_id === null) return true;
  return link.batch_id === cls.batch_id;
}

export async function ensureAssignedEnrollments(
  profileId: string,
  links: StudentLink[],
): Promise<void> {
  if (links.length === 0) return;

  const supabase = await createClient();
  const orgIds = [...new Set(links.map((link) => link.organization_id))];

  const { data: assignedClasses } = await supabase
    .from("classes")
    .select("id, organization_id, batch_id")
    .eq("enrollment_mode", "assigned")
    .in("organization_id", orgIds);

  if (!assignedClasses?.length) return;

  const matchingClassIds = assignedClasses
    .filter((cls) => links.some((link) => linkMatchesClass(link, cls)))
    .map((cls) => cls.id);

  if (matchingClassIds.length === 0) return;

  const { data: existing } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("student_profile_id", profileId)
    .in("class_id", matchingClassIds);

  const existingIds = new Set(existing?.map((row) => row.class_id) ?? []);
  const toInsert = matchingClassIds
    .filter((classId) => !existingIds.has(classId))
    .map((classId) => ({
      class_id: classId,
      student_profile_id: profileId,
      source: "school",
    }));

  if (toInsert.length > 0) {
    await supabase.from("class_enrollments").insert(toInsert);
  }
}

export async function markStudentOnboardingIfReady(
  profileId: string,
  fullName: string | null | undefined,
  onboardingCompleted: boolean,
): Promise<boolean> {
  if (onboardingCompleted || !fullName?.trim()) return onboardingCompleted;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", profileId);

  return !error;
}

export async function markNotificationRead(
  recipientId: string,
): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_recipient_id: recipientId,
  });

  if (error) return { error: error.message };

  revalidateStudentPaths();
  return { success: true };
}

export async function markAllUnreadNotificationsRead(): Promise<StudentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Student profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("student_profile_id", profile.id)
    .is("read_at", null);

  if (error) return { error: error.message };

  revalidateStudentPaths();
  return { success: true };
}
