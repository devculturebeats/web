"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { enrollInClass } from "@/app/(app)/student/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  groupSessionsIntoSlots,
  slotOptionSubtitle,
  type SessionLike,
} from "@/lib/class-slots";

type EnrollWithSlotsProps = {
  classId: string;
  sessions: SessionLike[];
  /** Compact button-only for list pages when no sessions loaded yet */
  requireSlots: boolean;
};

export function EnrollWithSlots({
  classId,
  sessions,
  requireSlots,
}: EnrollWithSlotsProps) {
  const [isPending, startTransition] = useTransition();
  const slots = useMemo(() => groupSessionsIntoSlots(sessions), [sessions]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEnroll = () => {
    if (requireSlots) {
      if (slots.length === 0) {
        toast.error("No upcoming slots are available for this class yet.");
        return;
      }
      if (selected.size === 0) {
        toast.error("Choose at least one day and time slot.");
        return;
      }
    }

    const sessionIds = slots
      .filter((slot) => selected.has(slot.key))
      .flatMap((slot) => slot.sessionIds);

    startTransition(async () => {
      const result = await enrollInClass(
        classId,
        requireSlots ? sessionIds : undefined,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        requireSlots ? "Enrolled in selected slots" : "Enrolled successfully",
      );
    });
  };

  if (!requireSlots) {
    return (
      <Button size="sm" disabled={isPending} onClick={handleEnroll}>
        {isPending ? "Enrolling…" : "Enroll"}
      </Button>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming slots yet. Check back once the teacher sets timings.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">Choose your slots</p>
        <p className="text-xs text-muted-foreground">
          Pick one or more weekly times. You&apos;ll enroll in every meeting in
          those slots.
        </p>
      </div>
      <ul className="space-y-2">
        {slots.map((slot) => {
          const id = `slot-${classId}-${slot.key}`;
          const checked = selected.has(slot.key);
          return (
            <li key={slot.key}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() => toggle(slot.key)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label htmlFor={id} className="cursor-pointer font-medium">
                    {slot.dayLabel} · {slot.timeLabel}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {slotOptionSubtitle(slot)}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
      <Button size="sm" disabled={isPending} onClick={handleEnroll}>
        {isPending ? "Enrolling…" : "Enroll in selected slots"}
      </Button>
    </div>
  );
}
