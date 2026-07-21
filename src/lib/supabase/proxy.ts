import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getDashboardPath } from "@/lib/auth/roles";
import type { AppRole, Database } from "@/types/database";

const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/forgot-password"]);
const AUTH_PREFIX = "/auth";
const ONBOARDING_TEACHER_PATH = "/onboarding/teacher";
const ONBOARDING_ORG_PATH = "/onboarding/organization";

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith(AUTH_PREFIX);
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const url = request.nextUrl.clone();
    url.pathname = getDashboardPath((profile?.role ?? "student") as AppRole);
    return NextResponse.redirect(url);
  }

  if (isAuthPage(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const url = request.nextUrl.clone();
    url.pathname = getDashboardPath((profile?.role ?? "student") as AppRole);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
