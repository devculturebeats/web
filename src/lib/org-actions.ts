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
  revalidatePath("/school/batches");
  revalidatePath("/school/students");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: student } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .eq("role", "student")
    .maybeSingle();

  if (student) {
    const { data: existingLink } = await supabase
      .from("student_links")
      .select("id")
      .eq("student_profile_id", student.id)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (existingLink) {
      return { error: "This student is already linked to your organization." };
    }
  }

  const { data: pending } = await supabase
    .from("student_link_requests")
    .select("id")
    .eq("organization_id", org.id)
    .eq("status", "requested")
    .ilike("student_email", email)
    .maybeSingle();

  if (pending) {
    return { error: "An invite is already waiting for this email." };
  }

  const { error } = await supabase.from("student_link_requests").insert({
    student_profile_id: student?.id ?? null,
    student_email: email,
    organization_id: org.id,
    batch_id: batchId || null,
    status: "requested",
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "An invite is already waiting for this email." };
    }
    return { error: error.message };
  }

  revalidatePath("/school");
  revalidatePath("/school/students");
  revalidatePath("/school/batches");
  revalidatePath("/academy");
  revalidatePath("/dashboard");
  return { success: true };
}
