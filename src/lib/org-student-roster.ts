"use server";

import { revalidatePath } from "next/cache";

import { getCurrentOrganization, assertOrgApproved } from "@/lib/orgs";
import { revalidateSchoolPaths } from "@/lib/school/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ImportStudentRow = {
  full_name: string;
  email?: string | null;
  batch_name?: string | null;
};

export type ImportStudentsResult = {
  error?: string;
  created?: number;
  updated?: number;
  failed?: number;
  errors?: { row: number; name: string; error: string }[];
};

export type IssueLoginResult = {
  error?: string;
  username?: string;
  password?: string;
  full_name?: string;
};

export async function importStudents(
  rows: ImportStudentRow[],
): Promise<ImportStudentsResult> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "No students to import." };
  }
  if (rows.length > 500) {
    return { error: "Import is limited to 500 students at a time." };
  }

  const payload = rows.map((row) => ({
    full_name: row.full_name?.trim() ?? "",
    email: row.email?.trim() || null,
    batch_name: row.batch_name?.trim() || null,
  }));

  const missingName = payload.findIndex((r) => !r.full_name);
  if (missingName >= 0) {
    return {
      error: `Row ${missingName + 1} is missing a student name.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_org_students", {
    p_organization_id: org.id,
    p_students: payload as unknown as Json,
  });

  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    created?: number;
    updated?: number;
    failed?: number;
    errors?: { row: number; name: string; error: string }[];
  };

  revalidateSchoolPaths();
  revalidatePath("/academy");
  revalidatePath("/dashboard");

  return {
    created: result.created ?? 0,
    updated: result.updated ?? 0,
    failed: result.failed ?? 0,
    errors: result.errors ?? [],
  };
}

export async function issueStudentLogin(
  studentProfileId: string,
): Promise<IssueLoginResult> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  if (!studentProfileId) return { error: "Student is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_student_login", {
    p_organization_id: org.id,
    p_student_profile_id: studentProfileId,
  });

  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    username?: string;
    password?: string;
    full_name?: string;
  };

  revalidateSchoolPaths(["/school/students", "/school"]);
  revalidatePath("/academy");

  return {
    username: result.username,
    password: result.password,
    full_name: result.full_name,
  };
}

export type AttachParentResult = {
  error?: string;
  mode?: string;
  parentProfileId?: string;
  requestId?: string;
  email?: string;
};

export async function attachParentToStudent(
  studentProfileId: string,
  parentEmail: string,
  parentFullName?: string | null,
  options?: { autoAccept?: boolean },
): Promise<AttachParentResult> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const email = parentEmail.trim();
  if (!email) return { error: "Parent email is required." };
  if (!studentProfileId) return { error: "Student is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("school_attach_parent", {
    p_organization_id: org.id,
    p_student_profile_id: studentProfileId,
    p_parent_email: email,
    p_parent_full_name: parentFullName?.trim() || null,
    p_auto_accept: options?.autoAccept ?? true,
  });

  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    mode?: string;
    parent_profile_id?: string;
    request_id?: string;
    parent_email?: string;
  };

  revalidateSchoolPaths(["/school/students", "/school"]);
  revalidatePath("/academy");
  revalidatePath("/parent");

  return {
    mode: result.mode,
    parentProfileId: result.parent_profile_id,
    requestId: result.request_id,
    email: result.parent_email ?? email,
  };
}

export async function provisionParentForStudent(
  studentProfileId: string,
  fullName: string,
  email?: string | null,
): Promise<AttachParentResult & { passwordHint?: string }> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  const name = fullName.trim();
  if (!name) return { error: "Parent name is required." };
  if (!studentProfileId) return { error: "Student is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("provision_org_parent", {
    p_organization_id: org.id,
    p_student_profile_id: studentProfileId,
    p_full_name: name,
    p_email: email?.trim() || null,
  });

  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    parent_profile_id?: string;
    email?: string;
    synthetic?: boolean;
  };

  revalidateSchoolPaths(["/school/students", "/school"]);
  revalidatePath("/academy");
  revalidatePath("/parent");

  return {
    mode: "provisioned",
    parentProfileId: result.parent_profile_id,
    email: result.email,
  };
}

export async function issueParentLogin(
  parentProfileId: string,
): Promise<IssueLoginResult> {
  const org = await getCurrentOrganization();
  if (!org) return { error: "Organization not found." };

  const approvalError = assertOrgApproved(org);
  if (approvalError) return { error: approvalError };

  if (!parentProfileId) return { error: "Parent is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_parent_login", {
    p_organization_id: org.id,
    p_parent_profile_id: parentProfileId,
  });

  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    username?: string;
    password?: string;
    full_name?: string;
  };

  revalidateSchoolPaths(["/school/students", "/school"]);
  revalidatePath("/academy");

  return {
    username: result.username,
    password: result.password,
    full_name: result.full_name,
  };
}
