"use server";

import { revalidatePath } from "next/cache";

import { requireApprovedTeacher } from "@/lib/auth/teacher-gate";
import { createClient } from "@/lib/supabase/server";

export type RequestActionState = {
  error?: string;
  success?: boolean;
};

export async function respondToClassRequest(
  requestId: string,
  accept: boolean,
): Promise<RequestActionState> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_class_request", {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) return { error: error.message };

  revalidatePath("/teacher/requests");
  revalidatePath("/school/classes");
  revalidatePath("/academy");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function respondToAcademyInvite(
  requestId: string,
  accept: boolean,
): Promise<RequestActionState> {
  const gate = await requireApprovedTeacher();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  await supabase.rpc("claim_teacher_link_invites");

  const { error } = await supabase.rpc("respond_to_teacher_link_request", {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) return { error: error.message };

  revalidatePath("/teacher/requests");
  revalidatePath("/academy");
  revalidatePath("/dashboard");
  return { success: true };
}
