import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminSchoolRequests,
  type SchoolNeedRow,
} from "@/components/admin/admin-school-requests";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

function orgFromRow(row: {
  organizations:
    | { id: string; name: string; city: string | null; type: string }
    | { id: string; name: string; city: string | null; type: string }[]
    | null;
}) {
  return (
    Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
  ) as { id: string; name: string; city: string | null; type: string } | null;
}

export default async function AdminSchoolRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "superadmin") redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: openNeedRows }, { data: rematchRows }] = await Promise.all([
    supabase
      .from("classes")
      .select(
        `
        id,
        title,
        skill,
        description,
        created_at,
        proposed_slots,
        proposed_day_of_week,
        proposed_start_time,
        proposed_end_time,
        organizations!inner ( id, name, city, type )
      `,
      )
      .eq("status", "requested")
      .is("teacher_id", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("classes")
      .select(
        `
        id,
        title,
        skill,
        description,
        created_at,
        rematch_reason,
        proposed_slots,
        proposed_day_of_week,
        proposed_start_time,
        proposed_end_time,
        teacher_id,
        organizations!inner ( id, name, city, type ),
        teachers (
          profiles (full_name)
        )
      `,
      )
      .eq("needs_rematch", true)
      .order("updated_at", { ascending: false }),
  ]);

  const schoolNeeds = (openNeedRows ?? []).filter(
    (row) => orgFromRow(row)?.type === "school",
  );
  const schoolRematches = (rematchRows ?? []).filter(
    (row) => orgFromRow(row)?.type === "school",
  );

  const trackedIds = [
    ...schoolNeeds.map((row) => row.id),
    ...schoolRematches.map((row) => row.id),
  ];

  const { data: openRequests } =
    trackedIds.length > 0
      ? await supabase
          .from("class_requests")
          .select("class_id")
          .in("class_id", trackedIds)
          .eq("status", "requested")
      : { data: [] };

  const requestedClassIds = new Set(
    (openRequests ?? []).map((row) => row.class_id),
  );

  const needs: SchoolNeedRow[] = [
    ...schoolNeeds
      .filter((row) => !requestedClassIds.has(row.id))
      .map((row) => {
        const org = orgFromRow(row)!;
        return {
          id: row.id,
          title: row.title,
          skill: row.skill,
          description: row.description,
          created_at: row.created_at,
          proposed_slots: row.proposed_slots,
          proposed_day_of_week: row.proposed_day_of_week,
          proposed_start_time: row.proposed_start_time,
          proposed_end_time: row.proposed_end_time,
          organization: {
            id: org.id,
            name: org.name,
            city: org.city,
          },
          kind: "need" as const,
        };
      }),
    ...schoolRematches
      .filter((row) => !requestedClassIds.has(row.id))
      .map((row) => {
        const org = orgFromRow(row)!;
        const teacher = (
          Array.isArray(row.teachers) ? row.teachers[0] : row.teachers
        ) as {
          profiles: { full_name: string } | { full_name: string }[] | null;
        } | null;
        const teacherProfile = Array.isArray(teacher?.profiles)
          ? teacher?.profiles[0]
          : teacher?.profiles;
        return {
          id: row.id,
          title: row.title,
          skill: row.skill,
          description: row.rematch_reason ?? row.description,
          created_at: row.created_at,
          proposed_slots: row.proposed_slots,
          proposed_day_of_week: row.proposed_day_of_week,
          proposed_start_time: row.proposed_start_time,
          proposed_end_time: row.proposed_end_time,
          organization: {
            id: org.id,
            name: org.name,
            city: org.city,
          },
          kind: "rematch" as const,
          currentTeacherName: teacherProfile?.full_name?.trim() || "Teacher",
        };
      }),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            School requests
          </h1>
          <p className="mt-1 text-muted-foreground">
            Match new school needs, or rematch classes schools flagged for a
            replacement teacher.
          </p>
        </div>
        <Link
          href="/admin"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to approvals
        </Link>
      </div>

      <AdminSchoolRequests needs={needs} />
    </div>
  );
}
