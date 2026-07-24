"use server";

import { revalidatePath } from "next/cache";

import { requireApprovedTeacher } from "@/lib/auth/teacher-gate";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilityConflict } from "@/types/database";

export type ScheduleActionState = {
  error?: string;
  success?: boolean;
  conflicts?: AvailabilityConflict[];
  requiresConfirmation?: boolean;
};

async function getApprovedTeacherId(): Promise<
  { teacherId: string } | { error: string }
> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };
  const teacherId = gate.profile.teacher?.id;
  if (!teacherId) return { error: "Teacher profile not found." };
  return { teacherId };
}

function isValidTimeRange(startTime: string, endTime: string): boolean {
  return startTime < endTime;
}

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = normalizeTime(startA);
  const aEnd = normalizeTime(endA);
  const bStart = normalizeTime(startB);
  const bEnd = normalizeTime(endB);
  return aStart < bEnd && bStart < aEnd;
}

async function findOverlappingAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teacherId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("teacher_availability")
    .select("id, start_time, end_time")
    .eq("teacher_id", teacherId)
    .eq("day_of_week", dayOfWeek);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error || !data) return false;

  return data.some((slot) =>
    timesOverlap(startTime, endTime, slot.start_time, slot.end_time),
  );
}

async function checkSlotConflicts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teacherId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  force: boolean,
): Promise<ScheduleActionState | null> {
  if (force) return null;

  const { data: conflicts, error } = await supabase.rpc(
    "find_availability_conflicts",
    {
      p_teacher_id: teacherId,
      p_day_of_week: dayOfWeek,
      p_start_time: normalizeTime(startTime),
      p_end_time: normalizeTime(endTime),
    },
  );

  if (error) return { error: error.message };

  if (conflicts && conflicts.length > 0) {
    return { requiresConfirmation: true, conflicts };
  }

  return null;
}

export async function createAvailabilitySlot(
  formData: FormData,
): Promise<ScheduleActionState> {
  const gate = await getApprovedTeacherId();
  if ("error" in gate) return { error: gate.error };
  const { teacherId } = gate;

  const dayOfWeek = parseInt(formData.get("day_of_week") as string, 10);
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "Invalid day of week." };
  }

  if (!startTime || !endTime) {
    return { error: "Start and end times are required." };
  }

  if (!isValidTimeRange(startTime, endTime)) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();

  const overlaps = await findOverlappingAvailability(
    supabase,
    teacherId,
    dayOfWeek,
    startTime,
    endTime,
  );
  if (overlaps) {
    return {
      error:
        "That time overlaps another slot on the same day. Adjust the hours first.",
    };
  }

  const { error } = await supabase.from("teacher_availability").insert({
    teacher_id: teacherId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { error: error.message };

  revalidatePath("/teacher/schedule");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateAvailabilitySlot(
  formData: FormData,
): Promise<ScheduleActionState> {
  const gate = await getApprovedTeacherId();
  if ("error" in gate) return { error: gate.error };
  const { teacherId } = gate;

  const slotId = formData.get("id") as string;
  const dayOfWeek = parseInt(formData.get("day_of_week") as string, 10);
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const force = formData.get("force") === "true";

  if (!slotId) return { error: "Slot ID is required." };

  if (!isValidTimeRange(startTime, endTime)) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("teacher_availability")
    .select("day_of_week, start_time, end_time")
    .eq("id", slotId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!existing) return { error: "Slot not found." };

  const overlaps = await findOverlappingAvailability(
    supabase,
    teacherId,
    dayOfWeek,
    startTime,
    endTime,
    slotId,
  );
  if (overlaps) {
    return {
      error:
        "That time overlaps another slot on the same day. Adjust the hours first.",
    };
  }

  const conflictResult = await checkSlotConflicts(
    supabase,
    teacherId,
    existing.day_of_week,
    existing.start_time,
    existing.end_time,
    force,
  );
  if (conflictResult) return conflictResult;

  const { error } = await supabase
    .from("teacher_availability")
    .update({
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
    })
    .eq("id", slotId)
    .eq("teacher_id", teacherId);

  if (error) return { error: error.message };

  revalidatePath("/teacher/schedule");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteAvailabilitySlot(
  formData: FormData,
): Promise<ScheduleActionState> {
  const gate = await getApprovedTeacherId();
  if ("error" in gate) return { error: gate.error };
  const { teacherId } = gate;

  const slotId = formData.get("id") as string;
  const force = formData.get("force") === "true";

  if (!slotId) return { error: "Slot ID is required." };

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("teacher_availability")
    .select("day_of_week, start_time, end_time")
    .eq("id", slotId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!existing) return { error: "Slot not found." };

  const conflictResult = await checkSlotConflicts(
    supabase,
    teacherId,
    existing.day_of_week,
    existing.start_time,
    existing.end_time,
    force,
  );
  if (conflictResult) return conflictResult;

  const { error } = await supabase
    .from("teacher_availability")
    .delete()
    .eq("id", slotId)
    .eq("teacher_id", teacherId);

  if (error) return { error: error.message };

  revalidatePath("/teacher/schedule");
  revalidatePath("/dashboard");
  return { success: true };
}
