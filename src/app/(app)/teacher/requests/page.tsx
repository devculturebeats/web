import { redirect } from "next/navigation";
import Link from "next/link";

import { ClassRequestList } from "@/components/teacher/class-request-list";
import type { ClassRequestWithDetails } from "@/components/teacher/class-request-list";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");

  const teacherId = profile.teacher?.id;
  if (!teacherId) {
    return (
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold">Class requests</h1>
        <p className="text-muted-foreground">
      Complete your teacher profile to receive class requests.{" "}
          <Link href="/onboarding/teacher" className="underline underline-offset-2">
            Complete profile
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("class_requests")
    .select(
      `
      id,
      class_id,
      teacher_id,
      status,
      message,
      proposed_day_of_week,
      proposed_start_time,
      proposed_end_time,
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
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as ClassRequestWithDetails[];
  const pending = requests.filter((r) => r.status === "requested");
  const history = requests.filter(
    (r) => r.status === "accepted" || r.status === "rejected",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Class requests</h1>
        <p className="mt-1 text-muted-foreground">
          Review invitations from schools and academies.
        </p>
      </div>
      <ClassRequestList pending={pending} history={history} />
    </div>
  );
}
