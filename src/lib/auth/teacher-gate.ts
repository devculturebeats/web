import { getCurrentProfile, type CurrentProfile } from "@/lib/profiles";

export const TEACHER_PENDING_MESSAGE =
  "Your profile is under review. Teaching tools unlock after approval.";

export function isTeacherApproved(
  profile: Pick<CurrentProfile, "role" | "approval_status">,
): boolean {
  return profile.role === "teacher" && profile.approval_status === "approved";
}

export function isTeacherPendingLock(
  profile: Pick<CurrentProfile, "role" | "approval_status">,
): boolean {
  return profile.role === "teacher" && profile.approval_status !== "approved";
}

export function isAllowedWhileTeacherPending(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname === "/teacher/profile" ||
    pathname === "/onboarding/teacher" ||
    pathname.startsWith("/account")
  );
}

export async function requireApprovedTeacher(): Promise<
  | { ok: true; profile: CurrentProfile }
  | { ok: false; error: string }
> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Teacher profile not found." };
  }
  if (profile.approval_status !== "approved") {
    return { ok: false, error: TEACHER_PENDING_MESSAGE };
  }
  return { ok: true, profile };
}

/** For shared actions used by teachers and other roles. */
export async function rejectIfUnapprovedTeacher(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (profile && isTeacherPendingLock(profile)) {
    return TEACHER_PENDING_MESSAGE;
  }
  return null;
}
