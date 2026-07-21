"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { respondToClassRequest } from "@/app/(app)/teacher/requests/actions";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/dates";
import { formatRecurrenceLabel } from "@/lib/recurrence";
import type { ClassRequest } from "@/types/database";

export type ClassRequestWithDetails = ClassRequest & {
  classes: {
    title: string;
    skill: string | null;
    organizations: { name: string } | null;
  } | null;
};

type ClassRequestListProps = {
  pending: ClassRequestWithDetails[];
};

function formatOneSlot(
  dayOfWeek: number,
  startTime: string | null,
  endTime: string | null,
): string {
  const dayLabel =
    DAYS_OF_WEEK.find((day) => day.value === dayOfWeek)?.label ??
    `Day ${dayOfWeek}`;

  const start = startTime ? formatTime(startTime.slice(0, 5)) : null;
  const end = endTime ? formatTime(endTime.slice(0, 5)) : null;

  if (start && end) return `${dayLabel} · ${start} – ${end}`;
  if (start) return `${dayLabel} · from ${start}`;
  return dayLabel;
}

function formatProposedSlots(request: ClassRequest): string | null {
  const raw = request.proposed_slots;
  if (Array.isArray(raw) && raw.length > 0) {
    const labels = raw
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }
        const day = Number(item.day);
        const start =
          typeof item.start === "string" ? item.start : null;
        const end = typeof item.end === "string" ? item.end : null;
        if (!Number.isInteger(day)) return null;
        return formatOneSlot(day, start, end);
      })
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) return labels.join(" · ");
  }

  if (request.proposed_day_of_week == null) return null;
  return formatOneSlot(
    request.proposed_day_of_week,
    request.proposed_start_time,
    request.proposed_end_time,
  );
}

function RequestCard({
  request,
  showActions,
}: {
  request: ClassRequestWithDetails;
  showActions: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const cls = request.classes;
  const proposedSlot = formatProposedSlots(request);
  const isScheduleUpdate = request.request_kind === "schedule";
  const recurrenceLabel = formatRecurrenceLabel({
    mode: request.recurrence_mode,
    until: request.recurrence_until,
  });

  const handleRespond = (accept: boolean) => {
    startTransition(async () => {
      const result = await respondToClassRequest(request.id, accept);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        accept
          ? isScheduleUpdate
            ? "Schedule update accepted"
            : "Request accepted"
          : "Request rejected",
      );
    });
  };

  return (
    <Card size="sm" className="gap-3">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-heading text-base font-medium leading-snug">
              {cls?.organizations?.name ?? "Independent"}
              {cls?.skill ? ` · ${cls.skill}` : ""}
            </p>
            {isScheduleUpdate && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Schedule update
              </p>
            )}
            {proposedSlot && (
              <p className="text-sm text-muted-foreground">{proposedSlot}</p>
            )}
            <p className="text-sm text-muted-foreground">{recurrenceLabel}</p>
            {request.message && (
              <p className="text-sm text-muted-foreground">{request.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {request.responded_at
                ? `Responded ${formatDateTime(request.responded_at)}`
                : `Received ${formatDateTime(request.created_at)}`}
            </p>
          </div>
          <LifecycleBadge status={request.status} />
        </div>
        {showActions && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => handleRespond(true)}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => handleRespond(false)}
            >
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ClassRequestList({ pending }: ClassRequestListProps) {
  return (
    <section className="space-y-3">
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending requests.</p>
      ) : (
        <div className="grid gap-3">
          {pending.map((request) => (
            <RequestCard key={request.id} request={request} showActions />
          ))}
        </div>
      )}
    </section>
  );
}
