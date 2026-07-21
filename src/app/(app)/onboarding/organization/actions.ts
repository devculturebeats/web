"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDashboardPath } from "@/lib/auth/roles";
import { orgTypeForRole } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export type OrgOnboardingState = {
  error?: string;
  success?: boolean;
};

export async function completeOrgOnboarding(
  formData: FormData,
): Promise<OrgOnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile not found." };

  const orgType = orgTypeForRole(profile.role as AppRole);
  if (!orgType) return { error: "Only school or academy admins can register an organization." };

  const name = (formData.get("name") as string)?.trim();
  const city = (formData.get("city") as string)?.trim() || null;
  const area = (formData.get("area") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return { error: "Organization name is required." };

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      type: orgType,
      name,
      city,
      area,
      description,
      approval_status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Failed to create organization." };
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      profile_id: user.id,
      member_role: "admin",
    });

  if (memberError) {
    return { error: memberError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/onboarding/organization");
  revalidatePath("/school");
  revalidatePath("/academy");
  revalidatePath("/dashboard");

  redirect(getDashboardPath(profile.role as AppRole));
}
