"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export type TeacherSettingsState = {
  error?: string;
  success?: boolean;
};

export async function updateAcademyDiscoverability(
  discoverable: boolean,
): Promise<TeacherSettingsState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher" || !profile.teacher?.id) {
    return { error: "Teacher profile not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update({ discoverable_by_academies: discoverable })
    .eq("id", profile.teacher.id)
    .eq("profile_id", profile.id);

  if (error) return { error: error.message };

  revalidatePath("/teacher/profile");
  revalidatePath("/dashboard");
  return { success: true };
}
