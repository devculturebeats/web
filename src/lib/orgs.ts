import { createClient } from "@/lib/supabase/server";
import type { AppRole, Organization } from "@/types/database";

export function assertOrgApproved(org: Organization): string | null {
  if (org.approval_status === "approved") return null;
  if (org.approval_status === "pending") {
    return "Your organization is pending approval. Operational actions are disabled until approved.";
  }
  return "Your organization was rejected. Contact support to resolve this.";
}

export function orgTypeForRole(role: AppRole): "school" | "academy" | null {
  if (role === "school_admin") return "school";
  if (role === "academy_admin") return "academy";
  return null;
}

export async function getCurrentOrganization(): Promise<Organization | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organizations(*)")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership?.organizations) return null;

  const org = membership.organizations as Organization | Organization[];
  return Array.isArray(org) ? (org[0] ?? null) : org;
}

export async function orgAdminNeedsOnboarding(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: rpcResult, error } = await supabase.rpc(
    "org_admin_needs_onboarding",
  );

  if (!error && typeof rpcResult === "boolean") {
    return rpcResult;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (
    !profile ||
    (profile.role !== "school_admin" && profile.role !== "academy_admin")
  ) {
    return false;
  }

  if (!profile.onboarding_completed) return true;

  const { count } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", userId);

  return (count ?? 0) === 0;
}
