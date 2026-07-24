import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getDashboardPath } from "@/lib/auth/roles";
import { isAllowedWhileTeacherPending } from "@/lib/auth/teacher-gate";
import type { AppRole, Database } from "@/types/database";

const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/forgot-password"]);
const AUTH_PREFIX = "/auth";
const ONBOARDING_TEACHER_PATH = "/onboarding/teacher";
const ONBOARDING_ORG_PATH = "/onboarding/organization";
const PENDING_APPROVAL_PATH = "/pending-approval";
const ACCOUNT_PREFIX = "/account";

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith(AUTH_PREFIX);
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
}

function isAllowedWhileOrgPending(pathname: string): boolean {
  return (
    pathname === PENDING_APPROVAL_PATH ||
    pathname === ONBOARDING_ORG_PATH ||
    pathname.startsWith(ACCOUNT_PREFIX)
  );
}

async function checkTeacherNeedsOnboarding(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<boolean> {
  const { data: rpcResult, error } = await supabase.rpc(
    "teacher_needs_onboarding",
  );

  if (!error && typeof rpcResult === "boolean") {
    return rpcResult;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, phone, onboarding_completed, teachers(primary_skill)")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.role !== "teacher") return false;

  const teachers = profile.teachers as
    | { primary_skill: string | null }
    | { primary_skill: string | null }[]
    | null;

  const teacher = Array.isArray(teachers) ? teachers[0] : teachers;

  return (
    !profile.onboarding_completed ||
    !profile.full_name?.trim() ||
    !profile.phone?.trim() ||
    !teacher?.primary_skill?.trim()
  );
}

async function checkOrgAdminNeedsOnboarding(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<boolean> {
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

async function getOrgApprovalStatus(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<"approved" | "pending" | "rejected" | null> {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organizations(approval_status)")
    .eq("profile_id", userId)
    .maybeSingle();

  const org = membership?.organizations as
    | { approval_status: string }
    | { approval_status: string }[]
    | null
    | undefined;

  const row = Array.isArray(org) ? org[0] : org;
  const status = row?.approval_status;
  if (status === "approved" || status === "pending" || status === "rejected") {
    return status;
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!isPublicPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const needsTeacherOnboarding = await checkTeacherNeedsOnboarding(
    supabase,
    user.id,
  );

  if (needsTeacherOnboarding && pathname !== ONBOARDING_TEACHER_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ONBOARDING_TEACHER_PATH;
    return NextResponse.redirect(url);
  }

  if (!needsTeacherOnboarding && pathname === ONBOARDING_TEACHER_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Hard-lock unapproved teachers away from product routes (schedule, classes, etc.).
  if (!needsTeacherOnboarding) {
    const { data: teacherProfile } = await supabase
      .from("profiles")
      .select("role, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    if (
      teacherProfile?.role === "teacher" &&
      teacherProfile.approval_status !== "approved" &&
      !isAllowedWhileTeacherPending(pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  const needsOrgOnboarding = await checkOrgAdminNeedsOnboarding(
    supabase,
    user.id,
  );

  if (needsOrgOnboarding && pathname !== ONBOARDING_ORG_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ONBOARDING_ORG_PATH;
    return NextResponse.redirect(url);
  }

  if (!needsOrgOnboarding && pathname === ONBOARDING_ORG_PATH) {
    const approval = await getOrgApprovalStatus(supabase, user.id);
    const url = request.nextUrl.clone();
    url.pathname =
      approval === "approved"
        ? getDashboardPath(
            (
              (
                await supabase
                  .from("profiles")
                  .select("role")
                  .eq("id", user.id)
                  .maybeSingle()
              ).data?.role ?? "student"
            ) as AppRole,
          )
        : PENDING_APPROVAL_PATH;
    return NextResponse.redirect(url);
  }

  // Hard-lock unverified institutions away from all product routes.
  if (!needsOrgOnboarding) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profile?.role === "school_admin" ||
      profile?.role === "academy_admin"
    ) {
      const approval = await getOrgApprovalStatus(supabase, user.id);
      if (approval && approval !== "approved") {
        if (!isAllowedWhileOrgPending(pathname)) {
          const url = request.nextUrl.clone();
          url.pathname = PENDING_APPROVAL_PATH;
          return NextResponse.redirect(url);
        }
      } else if (approval === "approved" && pathname === PENDING_APPROVAL_PATH) {
        const url = request.nextUrl.clone();
        url.pathname = getDashboardPath(profile.role as AppRole);
        return NextResponse.redirect(url);
      }
    }
  }

  if (isAuthPage(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role ?? "student") as AppRole;
    let dest = getDashboardPath(role);

    if (role === "school_admin" || role === "academy_admin") {
      const approval = await getOrgApprovalStatus(supabase, user.id);
      if (approval && approval !== "approved") {
        dest = PENDING_APPROVAL_PATH;
      }
    }

    const url = request.nextUrl.clone();
    url.pathname = dest;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
