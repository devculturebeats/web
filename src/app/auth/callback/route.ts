import { NextResponse } from "next/server";

import { teacherNeedsOnboarding } from "@/lib/profiles";
import { getDashboardPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const VALID_ROLES: AppRole[] = [
  "teacher",
  "student",
  "school_admin",
  "academy_admin",
];

function needsApproval(role: AppRole): boolean {
  return ["teacher", "school_admin", "academy_admin"].includes(role);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const roleParam = searchParams.get("role");
  const nextParam = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, onboarding_completed, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (
    roleParam &&
    VALID_ROLES.includes(roleParam as AppRole) &&
    profile &&
    !profile.onboarding_completed &&
    profile.role === "student"
  ) {
    const claimedRole = roleParam as AppRole;
    const createdAt = new Date(profile.created_at);
    const withinWindow = Date.now() - createdAt.getTime() < 15 * 60 * 1000;

    if (withinWindow) {
      await supabase
        .from("profiles")
        .update({
          role: claimedRole,
          approval_status: needsApproval(claimedRole) ? "pending" : "approved",
        })
        .eq("id", user.id);
    }
  }

  const { data: updatedProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const effectiveRole = updatedProfile?.role ?? profile?.role;

  if (effectiveRole === "teacher") {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!teacher) {
      await supabase.from("teachers").insert({ profile_id: user.id });
    }
  }

  const needsOnboarding = await teacherNeedsOnboarding(user.id);
  const home =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : getDashboardPath((effectiveRole ?? "student") as AppRole);
  const redirectPath = needsOnboarding ? "/onboarding/teacher" : home;

  return NextResponse.redirect(`${origin}${redirectPath}`);
}
