import { createClient } from "@/lib/supabase/server";
import type { Profile, Teacher } from "@/types/database";

export type CurrentProfile = Profile & {
  teacher: Teacher | null;
};

function normalizeTeacher(
  teachers: Teacher | Teacher[] | null | undefined,
): Teacher | null {
  if (!teachers) return null;
  return Array.isArray(teachers) ? (teachers[0] ?? null) : teachers;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, teachers(*)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { teachers, ...rest } = profile as Profile & {
    teachers: Teacher | Teacher[] | null;
  };

  return {
    ...rest,
    teacher: normalizeTeacher(teachers),
  };
}

export async function teacherNeedsOnboarding(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: rpcResult, error } = await supabase.rpc(
    "teacher_needs_onboarding",
  );

  if (!error && typeof rpcResult === "boolean") {
    return rpcResult;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, phone, onboarding_completed, teachers(primary_skill)")
    .eq("id", userId)
    .single();

  if (!profile || profile.role !== "teacher") return false;

  const teacher = normalizeTeacher(
    (profile as { teachers: Teacher | Teacher[] | null }).teachers,
  );

  return (
    !profile.onboarding_completed ||
    !profile.full_name?.trim() ||
    !profile.phone?.trim() ||
    !teacher?.primary_skill?.trim()
  );
}
