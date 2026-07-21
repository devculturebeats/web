"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <p className="text-sm text-muted-foreground">
        No personal classes yet. Create one above to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-semibold">Scheduled</h2>
      <div className="grid gap-4">
        {classes.map((cls) => (
          <Card key={cls.id}>
            <CardHeader className="pb-3">
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
                  Your own listing
                  {cls.skill && cls.skill !== cls.title
                    ? ` · ${cls.skill}`
                    : ""}
                  {cls.rateLabel ? ` · ${cls.rateLabel}` : ""}
                </CardDescription>
              </div>
            </CardHeader>
              <CardContent>
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
              </CardContent>
          </Card>
        ))}
      </div>
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

  return <ClassCards classes={personal} />;
}
