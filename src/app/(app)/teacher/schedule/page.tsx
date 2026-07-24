import { redirect } from "next/navigation";

import { AvailabilityManager } from "@/components/teacher/availability-manager";
import { isTeacherApproved } from "@/lib/auth/teacher-gate";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { TeacherAvailability } from "@/types/database";

export default async function TeacherSchedulePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");
  if (!isTeacherApproved(profile)) redirect("/dashboard");

  const supabase = await createClient();
  const teacherId = profile.teacher?.id;

  let slots: TeacherAvailability[] = [];

  if (teacherId) {
    const { data } = await supabase
      .from("teacher_availability")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("day_of_week")
      .order("start_time");

    slots = data ?? [];
  }

  return (
    <div>
      <AvailabilityManager slots={slots ?? []} />
    </div>
  );
}
