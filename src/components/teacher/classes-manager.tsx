"use client";

import Link from "next/link";
import { useMemo } from "react";

import { LifecycleBadge } from "@/components/lifecycle-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/dates";
import type { ClassLifecycle, ClassSession } from "@/types/database";

export type ClassStudent = {
  profileId: string;
  fullName: string;
};

export type TeacherClassData = {
  id: string;
  title: string;
  skill: string | null;
  status: ClassLifecycle;
  enrollmentMode: string;
  orgName: string | null;
  isHomeStudio: boolean;
  rateLabel: string | null;
  locationLabel: string | null;
  sessions: ClassSession[];
  students: ClassStudent[];
  attendanceBySession: Record<string, Record<string, boolean>>;
};

type ClassesManagerProps = {
  classes: TeacherClassData[];
};

function ClassCards({ classes }: { classes: TeacherClassData[] }) {
  if (classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No classes in this list.</p>
    );
  }

  return (
    <div className="grid gap-4">
      {classes.map((cls) => {
        const sessions = [...cls.sessions]
          .filter(
            (s) => s.status === "scheduled" || s.status === "postponed",
          )
          .sort(
            (a, b) =>
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          )
          .slice(0, 3);

        return (
          <Card key={cls.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href={`/classes/${cls.id}`}
                      className="hover:underline"
                    >
                      {cls.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {cls.isHomeStudio
                      ? "Your own listing"
                      : (cls.orgName ?? "Organization")}
                    {cls.skill ? ` · ${cls.skill}` : ""}
                    {cls.rateLabel ? ` · ${cls.rateLabel}` : ""}
                  </CardDescription>
                </div>
                <LifecycleBadge status={cls.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {cls.students.length} student
                  {cls.students.length === 1 ? "" : "s"} enrolled
                </p>
                <Link
                  href={`/classes/${cls.id}`}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open class
                </Link>
              </div>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {cls.isHomeStudio
                    ? "No upcoming timings yet."
                    : "Meetings not scheduled yet — open the class to set timings."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      {formatDateTime(session.starts_at)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ClassesManager({ classes }: ClassesManagerProps) {
  const personal = useMemo(
    () =>
      classes
        .filter((cls) => cls.isHomeStudio)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [classes],
  );
  const withOrgs = useMemo(
    () =>
      classes
        .filter((cls) => !cls.isHomeStudio)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [classes],
  );

  if (classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No classes yet. Create one above, or accept a school request.
      </p>
    );
  }

  return (
    <Tabs
      defaultValue={personal.length > 0 ? "personal" : "org"}
      className="gap-4"
    >
      <TabsList className="!h-14 w-full max-w-xl gap-1 rounded-xl p-1.5">
        <TabsTrigger
          value="personal"
          className="h-full rounded-lg px-6 text-base font-semibold"
        >
          Personal classes
          <span className="ml-2 rounded-md bg-muted-foreground/15 px-2 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">
            {personal.length}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="org"
          className="h-full rounded-lg px-6 text-base font-semibold"
        >
          At schools
          <span className="ml-2 rounded-md bg-muted-foreground/15 px-2 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">
            {withOrgs.length}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="personal" className="mt-1 space-y-3">
        <p className="text-sm text-muted-foreground">
          Classes you posted — students can join directly.
        </p>
        <ClassCards classes={personal} />
      </TabsContent>
      <TabsContent value="org" className="mt-1 space-y-3">
        <p className="text-sm text-muted-foreground">
          Classes with schools and academies.
        </p>
        <ClassCards classes={withOrgs} />
      </TabsContent>
    </Tabs>
  );
}
