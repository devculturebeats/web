"use server";

import { revalidatePath } from "next/cache";

import { requireApprovedTeacher } from "@/lib/auth/teacher-gate";
import { createClient } from "@/lib/supabase/server";

export type TeacherSettingsState = {
  error?: string;
  success?: boolean;
};

export async function updateAcademyDiscoverability(
  discoverable: boolean,
): Promise<TeacherSettingsState> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };
  if (!gate.profile.teacher?.id) {
    return { error: "Teacher profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update({ discoverable_by_academies: discoverable })
    .eq("id", gate.profile.teacher.id)
    .eq("profile_id", gate.profile.id);

  if (error) return { error: error.message };

  revalidatePath("/teacher/profile");
  revalidatePath("/dashboard");
  return { success: true };
}
