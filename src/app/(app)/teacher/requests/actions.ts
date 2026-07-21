"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RequestActionState = {
  error?: string;
  success?: boolean;
};

export async function respondToClassRequest(
  requestId: string,
  accept: boolean,
): Promise<RequestActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.rpc("respond_to_class_request", {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) return { error: error.message };

  revalidatePath("/teacher/requests");
  revalidatePath("/school/classes");
  revalidatePath("/dashboard");
  return { success: true };
}
