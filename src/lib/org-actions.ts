"use server";

import { revalidatePath } from "next/cache";

import { getCurrentOrganization, assertOrgApproved } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type OrgActionState = {
  error?: string;
  success?: boolean;
};

export async function createBatch(formData: FormData): Promise<OrgActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return { error: "Batch name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("batches").insert({
    organization_id: org.id,
    name,
    description,
  });

  if (error) return { error: error.message };

  revalidatePath("/school");
  revalidatePath("/academy");
  return { success: true };
}

export async function linkStudent(formData: FormData): Promise<OrgActionState> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const batchId = (formData.get("batch_id") as string)?.trim() || null;

  if (!email) return { error: "Student email is required." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .eq("role", "student")
    .maybeSingle();

  if (!student) {
    return { error: "No student account found with that email." };
  }

  const { error } = await supabase.from("student_links").insert({
    student_profile_id: student.id,
    organization_id: org.id,
    batch_id: batchId || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "This student is already linked to your organization." };
    }
    return { error: error.message };
  }

  const { error: enrollError } = await supabase.rpc(
    "enroll_student_into_org_assigned_classes",
    {
      p_student_id: student.id,
      p_organization_id: org.id,
    },
  );

  if (enrollError) return { error: enrollError.message };

  revalidatePath("/school");
  revalidatePath("/academy");
  return { success: true };
}
