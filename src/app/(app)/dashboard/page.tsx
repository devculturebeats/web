import Link from "next/link";
import { redirect } from "next/navigation";

import { StudentHome } from "@/components/student/student-home";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatLocationType } from "@/lib/class-pricing";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { getDashboardPath } from "@/lib/auth/roles";
import { formatDateTime, formatTime } from "@/lib/dates";
import { getCurrentProfile } from "@/lib/profiles";
import { loadStudentDashboardData } from "@/lib/student/data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function ApprovalBanner({ status }: { status: string }) {
  if (status === "approved") return null;

  const isPending = status === "pending";

  return (
    <Card className={isPending ? "border-primary/30" : "border-destructive/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isPending ? "Profile under review" : "Profile not approved"}
        </CardTitle>
        <CardDescription>
          {isPending
            ? "Schools can see you after approval. You can still set availability and finish your profile."
            : "Contact support if you think this is a mistake."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant={isPending ? "secondary" : "destructive"}>
          {isPending ? "Under review" : "Not approved"}
        </Badge>
      </CardContent>
    </Card>
  );
}

function getTodayWeekdayInAppTz(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? new Date().getDay();
}

function dateKeyInAppTz(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayParts(iso: string): { weekday: string; day: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
  };
}

function sessionTime(iso: string): string {
  return formatDateTime(iso).split(" · ")[1] ?? "";
}

async function TeacherHome({
  teacherId,
  fullName,
  approvalStatus,
}: {
  teacherId: string | undefined;
  fullName: string | null;
  approvalStatus: string;
}) {
  const firstName = fullName?.split(" ")[0];
  const supabase = await createClient();
  const todayDow = getTodayWeekdayInAppTz();
  const todayLabel =
    DAYS_OF_WEEK.find((d) => d.value === todayDow)?.label ?? "Today";

  let pendingCount = 0;
  let todaySlots: { id: string; start_time: string; end_time: string }[] = [];
  let upcoming: {
    id: string;
    starts_at: string;
    class_id: string;
    title: string;
    status: string;
    place: string | null;
  }[] = [];

  if (teacherId) {
    const [{ count }, { data: availability }, { data: classRows }] =
      await Promise.all([
        supabase
          .from("class_requests")
          .select("id", { count: "exact", head: true })
          .eq("teacher_id", teacherId)
          .eq("status", "requested"),
        supabase
          .from("teacher_availability")
          .select("id, start_time, end_time")
          .eq("teacher_id", teacherId)
          .eq("day_of_week", todayDow)
          .order("start_time"),
        supabase
          .from("classes")
          .select(
            "id, title, location_type, location_note, is_home_studio, organizations(name, city, area), class_sessions(id, starts_at, ends_at, status)",
          )
          .eq("teacher_id", teacherId)
          .neq("status", "cancelled"),
      ]);

    pendingCount = count ?? 0;
    todaySlots = availability ?? [];

    const now = Date.now();
    upcoming = (classRows ?? [])
      .flatMap((cls) => {
        const sessions = (cls.class_sessions ?? []) as {
          id: string;
          starts_at: string;
          ends_at: string;
          status: string;
        }[];
        const org = Array.isArray(cls.organizations)
          ? cls.organizations[0]
          : cls.organizations;
        const orgPlace = org
          ? [org.name, org.area || org.city].filter(Boolean).join(" · ")
          : null;
        const locationFallback =
          [formatLocationType(cls.location_type), cls.location_note]
            .filter(Boolean)
            .join(" · ") || null;
        const place =
          orgPlace ||
          (cls.is_home_studio ? "Home studio" : null) ||
          locationFallback;

        return sessions
          .filter(
            (s) =>
              (s.status === "scheduled" || s.status === "postponed") &&
              // Keep today's class visible until it ends, not only before it starts.
              new Date(s.ends_at || s.starts_at).getTime() >= now,
          )
          .map((s) => ({
            id: s.id,
            starts_at: s.starts_at,
            class_id: cls.id,
            title: cls.title,
            status: s.status,
            place,
          }));
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .slice(0, 12);
  }

  const upcomingByDay = upcoming.reduce<
    {
      key: string;
      weekday: string;
      day: string;
      month: string;
      items: typeof upcoming;
    }[]
  >((groups, session) => {
    const key = dateKeyInAppTz(session.starts_at);
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.items.push(session);
    } else {
      const { weekday, day, month } = dayParts(session.starts_at);
      groups.push({
        key,
        weekday,
        day,
        month,
        items: [session],
      });
    }
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {firstName ? `Hi, ${firstName}` : "Welcome"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your day at a glance — availability and upcoming classes.
        </p>
      </div>

      <ApprovalBanner status={approvalStatus} />

      {!teacherId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finish your profile</CardTitle>
            <CardDescription>
              Schools find you once your teaching profile is complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/onboarding/teacher"
              className={cn(buttonVariants(), "inline-flex")}
            >
              Complete profile
            </Link>
          </CardContent>
        </Card>
      )}

      {teacherId && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg font-semibold">
                Today&apos;s availability
              </h2>
              <p className="text-sm text-muted-foreground">{todayLabel}</p>
            </div>
            <Link
              href="/teacher/schedule"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Edit availability
            </Link>
          </div>
          {todaySlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No availability set for today.{" "}
              <Link
                href="/teacher/schedule"
                className="underline underline-offset-2"
              >
                Add a slot
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {todaySlots.map((slot) => (
                <li
                  key={slot.id}
                  className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium"
                >
                  {formatTime(slot.start_time.slice(0, 5))} –{" "}
                  {formatTime(slot.end_time.slice(0, 5))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pendingCount > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Incoming requests</CardTitle>
            <CardDescription>
              Schools inviting you to teach a class.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-heading text-3xl font-semibold tabular-nums">
              {pendingCount}
            </p>
            <Link
              href="/teacher/requests"
              className={cn(buttonVariants({ size: "sm" }), "inline-flex")}
            >
              Review requests
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Coming up</h2>
        {upcomingByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming sessions. Accept a request or publish a class to get
            started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {upcomingByDay.map((group, index) => (
              <div
                key={group.key}
                className={cn(
                  "grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5.5rem_1fr]",
                  index > 0 && "border-t",
                )}
              >
                <div className="flex flex-col items-center justify-start border-r bg-muted/30 px-2 py-4 text-center">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.weekday}
                  </span>
                  <span className="font-heading text-2xl font-semibold tabular-nums leading-none tracking-tight">
                    {group.day}
                  </span>
                  <span className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {group.month}
                  </span>
                </div>
                <ul className="divide-y">
                  {group.items.map((session) => (
                    <li
                      key={session.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">
                          <Link
                            href={`/classes/${session.class_id}`}
                            className="hover:underline"
                          >
                            {session.title}
                          </Link>
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                          {sessionTime(session.starts_at)}
                        </p>
                        {session.place && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {session.place}
                          </p>
                        )}
                      </div>
                      {session.status !== "scheduled" && (
                        <LifecycleBadge status={session.status} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (
    profile.role === "school_admin" ||
    profile.role === "academy_admin" ||
    profile.role === "superadmin"
  ) {
    redirect(getDashboardPath(profile.role));
  }

  if (profile.role === "student") {
    const { myClasses: _myClasses, ...homeData } =
      await loadStudentDashboardData(profile);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Hi
            {profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-muted-foreground">
            See what&apos;s coming up this week.
          </p>
        </div>
        <StudentHome {...homeData} />
      </div>
    );
  }

  return (
    <TeacherHome
      teacherId={profile.teacher?.id}
      fullName={profile.full_name}
      approvalStatus={profile.approval_status}
    />
  );
}
