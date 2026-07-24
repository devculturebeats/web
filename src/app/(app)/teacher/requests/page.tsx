import { redirect } from "next/navigation";
import Link from "next/link";

import {
  AcademyInviteList,
  type AcademyInviteWithOrg,
} from "@/components/teacher/academy-invite-list";
import { ClassRequestList } from "@/components/teacher/class-request-list";
import type { ClassRequestWithDetails } from "@/components/teacher/class-request-list";
import { isTeacherApproved } from "@/lib/auth/teacher-gate";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");
  if (!isTeacherApproved(profile)) redirect("/dashboard");

  const teacherId = profile.teacher?.id;
  if (!teacherId) {
    return (
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold">Requests</h1>
        <p className="text-muted-foreground">
          Complete your teacher profile to receive invites.{" "}
          <Link
            href="/onboarding/teacher"
            className="underline underline-offset-2"
          >
            Complete profile
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  await supabase.rpc("claim_teacher_link_invites");

  const { data: academyInvitesByProfile } = await supabase
    .from("teacher_link_requests")
    .select(
      `
      id,
      teacher_email,
      created_at,
      organizations ( name, city )
    `,
    )
    .eq("status", "requested")
    .eq("teacher_profile_id", profile.id)
    .order("created_at", { ascending: false });

  const { data: academyInvitesByEmail } = await supabase
    .from("teacher_link_requests")
    .select(
      `
      id,
      teacher_email,
      created_at,
      organizations ( name, city )
    `,
    )
    .eq("status", "requested")
    .is("teacher_profile_id", null)
    .ilike("teacher_email", profile.email)
    .order("created_at", { ascending: false });

  const academyInviteMap = new Map<string, AcademyInviteWithOrg>();
  for (const row of [
    ...(academyInvitesByProfile ?? []),
    ...(academyInvitesByEmail ?? []),
  ]) {
    academyInviteMap.set(row.id, row as AcademyInviteWithOrg);
  }
  const pendingAcademy = [...academyInviteMap.values()];

  const { data } = await supabase
    .from("class_requests")
    .select(
      `
      id,
      class_id,
      teacher_id,
      status,
      message,
      request_kind,
      recurrence_mode,
      recurrence_until,
      proposed_day_of_week,
      proposed_start_time,
      proposed_end_time,
      proposed_slots,
      created_at,
      responded_at,
      classes (
        title,
        skill,
        organizations (name)
      )
    `,
    )
    .eq("teacher_id", teacherId)
    .eq("status", "requested")
    .order("created_at", { ascending: false });

  const pending = (data ?? []) as ClassRequestWithDetails[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Academy membership invites and class teaching requests.
        </p>
      </div>

      <AcademyInviteList pending={pendingAcademy} />

      <div className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Class requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review invitations to teach specific classes.
          </p>
        </div>
        <ClassRequestList pending={pending} />
      </div>
    </div>
  );
}
