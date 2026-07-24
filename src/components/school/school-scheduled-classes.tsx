"use client";

import Link from "next/link";

import { LifecycleBadge } from "@/components/lifecycle-badge";
import { PaginatedList } from "@/components/ui/client-pagination";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/dates";
import { formatRecurrenceLabel } from "@/lib/recurrence";
import type { SchoolClass } from "@/lib/school/data";
import { cn } from "@/lib/utils";
import { slotsFromProposed } from "@/lib/week-slots";

function shortRecurrence(cls: SchoolClass): string | null {
  const mode = cls.recurrence_mode ?? "once";
  if (mode === "ongoing") return "Ongoing";
  if (mode === "until_date") {
    return formatRecurrenceLabel({
      mode,
      until: cls.recurrence_until,
    }).replace(/^Every week /i, "");
  }
  return null;
}

function weeklyPattern(cls: SchoolClass): string | null {
  const slots = slotsFromProposed(cls);
  if (!slots || slots.length === 0) return null;

  return slots
    .map((slot) => {
      const dayLabel =
        DAYS_OF_WEEK.find((day) => day.value === slot.day)?.label ??
        `Day ${slot.day}`;
      return `${dayLabel} ${formatTime(slot.start.slice(0, 5))}–${formatTime(slot.end.slice(0, 5))}`;
    })
    .join(", ");
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

export function SchoolScheduledClasses({
  classes,
}: {
  classes: SchoolClass[];
}) {
  const active = classes.filter((cls) => cls.status !== "cancelled");

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No scheduled classes yet. Request a teacher to get started.
      </p>
    );
  }

  return (
    <PaginatedList items={active} pageSize={10} label="classes">
      {(pageItems) => (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {pageItems.map((cls, index) => {
            const upcoming = [...cls.sessions]
              .filter((s) => s.status === "scheduled" || s.status === "postponed")
              .sort(
                (a, b) =>
                  new Date(a.starts_at).getTime() -
                  new Date(b.starts_at).getTime(),
              )
              .filter(
                (s) =>
                  new Date(s.ends_at || s.starts_at).getTime() >= Date.now(),
              );

            const next = upcoming[0] ?? null;
            const laterCount = Math.max(upcoming.length - 1, 0);
            const pattern = weeklyPattern(cls);
            const recurrence = shortRecurrence(cls);
            const teacherName = cls.teacher?.profiles?.full_name ?? null;
            const dateColumn = next ? dayParts(next.starts_at) : null;

            return (
              <li
                key={cls.id}
                className={cn(
                  "grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5.5rem_1fr]",
                  index > 0 && "border-t",
                )}
              >
                <div className="flex flex-col items-center justify-start border-r bg-muted/30 px-2 py-4 text-center">
                  {dateColumn ? (
                    <>
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        {dateColumn.weekday}
                      </span>
                      <span className="font-heading text-2xl font-semibold tabular-nums leading-none tracking-tight">
                        {dateColumn.day}
                      </span>
                      <span className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                        {dateColumn.month}
                      </span>
                    </>
                  ) : (
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      TBD
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/classes/${cls.id}`}
                        className="font-heading text-base font-semibold hover:underline"
                      >
                        {cls.title}
                      </Link>
                      {cls.status !== "scheduled" && (
                        <LifecycleBadge status={cls.status} />
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {[teacherName, pattern, recurrence]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    {next ? (
                      <p className="text-sm text-muted-foreground">
                        Next {sessionTime(next.starts_at)}
                        {laterCount > 0
                          ? ` · ${laterCount} more upcoming`
                          : ""}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No upcoming meetings yet
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/classes/${cls.id}`}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PaginatedList>
  );
}
