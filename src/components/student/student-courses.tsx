"use client";

import Link from "next/link";

import {
  formatEnrollmentSource,
  LeaveClassButton,
} from "@/components/student/student-action-buttons";
import type { EnrolledClass } from "@/components/student/types";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PaginatedList } from "@/components/ui/client-pagination";
import { formatDateTime } from "@/lib/dates";

type StudentCoursesProps = {
  myClasses: EnrolledClass[];
};

export function StudentCourses({ myClasses }: StudentCoursesProps) {
  if (myClasses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No courses yet.{" "}
        <Link href="/student/browse" className="underline underline-offset-2">
          Browse classes
        </Link>
        .
      </p>
    );
  }

  return (
    <PaginatedList items={myClasses} pageSize={10} label="courses">
      {(pageItems) => (
        <div className="grid gap-3">
          {pageItems.map((cls) => {
            const place =
              [cls.locationLabel, cls.locationNote].filter(Boolean).join(" · ") ||
              null;

            return (
              <Card key={cls.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-medium">
                      <Link
                        href={`/classes/${cls.id}`}
                        className="hover:underline"
                      >
                        {cls.title}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {cls.isHomeStudio
                        ? cls.teacherName
                          ? `Home studio · ${cls.teacherName}`
                          : "Home studio"
                        : (cls.orgName ?? "Independent")}
                      {cls.skill && cls.skill !== cls.title
                        ? ` · ${cls.skill}`
                        : ""}
                    </p>
                    {place && (
                      <p className="text-sm text-muted-foreground">
                        Place: {place}
                      </p>
                    )}
                    {cls.nextMeetingAt ? (
                      <p className="text-sm text-muted-foreground">
                        Next meeting: {formatDateTime(cls.nextMeetingAt)}
                      </p>
                    ) : cls.nextMeetingNote ? (
                      <p className="text-sm text-muted-foreground">
                        {cls.nextMeetingNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {cls.isHomeStudio
                        ? "Home studio"
                        : formatEnrollmentSource(cls.source)}
                    </Badge>
                    <LifecycleBadge status={cls.status} />
                    {cls.canLeave && <LeaveClassButton classId={cls.id} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PaginatedList>
  );
}
