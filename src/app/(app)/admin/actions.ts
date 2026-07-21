"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ApprovalStatus } from "@/types/database";

export type AdminActionState = {
  error?: string;
  success?: boolean;
};

async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    redirect("/dashboard");
  }

  return supabase;
}

export async function updateTeacherApproval(
  profileId: string,
  status: ApprovalStatus,
): Promise<AdminActionState> {
  const supabase = await requireSuperadmin();

  const { error } = await supabase
    .from("profiles")
    .update({ approval_status: status })
    .eq("id", profileId)
    .eq("role", "teacher");

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export async function updateOrgApproval(
  orgId: string,
  status: ApprovalStatus,
): Promise<AdminActionState> {
  const supabase = await requireSuperadmin();

  const { error } = await supabase
    .from("organizations")
    .update({ approval_status: status })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
