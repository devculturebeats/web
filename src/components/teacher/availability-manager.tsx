"use client";

import { useState, useTransition } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  createAvailabilitySlot,
  deleteAvailabilitySlot,
  updateAvailabilitySlot,
  type ScheduleActionState,
} from "@/app/(app)/teacher/schedule/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/dates";
import { DAYS_OF_WEEK } from "@/lib/constants";
import type { AvailabilityConflict, TeacherAvailability } from "@/types/database";

type AvailabilityManagerProps = {
  slots: TeacherAvailability[];
};

type SlotTimes = {
  start_time: string;
  end_time: string;
};

type PendingAction =
  | { type: "update"; slotId: string; day: number; form: SlotTimes }
  | { type: "delete"; slotId: string };

const defaultTimes: SlotTimes = {
  start_time: "09:00",
  end_time: "12:00",
};

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function groupSlotsByDay(slots: TeacherAvailability[]) {
  const grouped = new Map<number, TeacherAvailability[]>();
  for (const day of DAYS_OF_WEEK) {
    grouped.set(day.value, []);
  }
  for (const slot of slots) {
    const daySlots = grouped.get(slot.day_of_week) ?? [];
    daySlots.push(slot);
    grouped.set(slot.day_of_week, daySlots);
  }
  for (const [, daySlots] of grouped) {
    daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return grouped;
}

function conflictDescription(conflict: AvailabilityConflict): string {
  if (conflict.conflict_source === "session" && conflict.starts_at) {
    return `${conflict.class_title} (${formatDateTime(conflict.starts_at)})`;
  }
  return conflict.class_title;
}

function TimeFields({
  times,
  onChange,
  idPrefix,
}: {
  times: SlotTimes;
  onChange: (next: SlotTimes) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-start`}>Start</Label>
        <Input
          id={`${idPrefix}-start`}
          type="time"
          value={times.start_time}
          onChange={(e) =>
            onChange({ ...times, start_time: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-end`}>End</Label>
        <Input
          id={`${idPrefix}-end`}
          type="time"
          value={times.end_time}
          onChange={(e) => onChange({ ...times, end_time: e.target.value })}
        />
      </div>
    </div>
  );
}

export function AvailabilityManager({ slots }: AvailabilityManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [times, setTimes] = useState<SlotTimes>(defaultTimes);
  const [conflicts, setConflicts] = useState<AvailabilityConflict[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const grouped = groupSlotsByDay(slots);

  const validateTimes = (start: string, end: string): boolean => {
    if (start >= end) {
      toast.error("End time must be after start time.");
      return false;
    }
    return true;
  };

  const handleActionResult = (
    result: ScheduleActionState,
    onSuccess: () => void,
  ) => {
    if (result.requiresConfirmation && result.conflicts?.length) {
      setConflicts(result.conflicts);
      setConfirmOpen(true);
      return;
    }
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onSuccess();
  };

  const executePendingAction = (force = false) => {
    if (!pendingAction) return;

    startTransition(async () => {
      let result: ScheduleActionState;

      if (pendingAction.type === "update") {
        const formData = new FormData();
        formData.set("id", pendingAction.slotId);
        formData.set("day_of_week", pendingAction.day.toString());
        formData.set("start_time", pendingAction.form.start_time);
        formData.set("end_time", pendingAction.form.end_time);
        if (force) formData.set("force", "true");
        result = await updateAvailabilitySlot(formData);
      } else {
        const formData = new FormData();
        formData.set("id", pendingAction.slotId);
        if (force) formData.set("force", "true");
        result = await deleteAvailabilitySlot(formData);
      }

      if (result.requiresConfirmation && result.conflicts?.length && !force) {
        setConflicts(result.conflicts);
        setConfirmOpen(true);
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (pendingAction.type === "update") {
        toast.success("Slot updated.");
        setEditingId(null);
        setTimes(defaultTimes);
      } else {
        toast.success("Slot removed.");
      }

      setConfirmOpen(false);
      setPendingAction(null);
      setConflicts([]);
    });
  };

  const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    const norm = (t: string) => (t.length === 5 ? `${t}:00` : t);
    return norm(aStart) < norm(bEnd) && norm(bStart) < norm(aEnd);
  };

  const overlapsExisting = (
    day: number,
    start: string,
    end: string,
    excludeId?: string,
  ) => {
    const daySlots = grouped.get(day) ?? [];
    return daySlots.some(
      (slot) =>
        slot.id !== excludeId &&
        timesOverlap(start, end, slot.start_time, slot.end_time),
    );
  };

  const handleAdd = (day: number) => {
    if (!validateTimes(times.start_time, times.end_time)) return;
    if (overlapsExisting(day, times.start_time, times.end_time)) {
      toast.error(
        "That time overlaps another slot on the same day. Adjust the hours first.",
      );
      return;
    }

    const formData = new FormData();
    formData.set("day_of_week", day.toString());
    formData.set("start_time", times.start_time);
    formData.set("end_time", times.end_time);

    startTransition(async () => {
      const result = await createAvailabilitySlot(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Availability slot added.");
      setAddingDay(null);
      setTimes(defaultTimes);
    });
  };

  const handleUpdate = (slotId: string, day: number) => {
    if (!validateTimes(times.start_time, times.end_time)) return;
    if (overlapsExisting(day, times.start_time, times.end_time, slotId)) {
      toast.error(
        "That time overlaps another slot on the same day. Adjust the hours first.",
      );
      return;
    }

    const action: PendingAction = {
      type: "update",
      slotId,
      day,
      form: { ...times },
    };
    setPendingAction(action);

    const formData = new FormData();
    formData.set("id", slotId);
    formData.set("day_of_week", day.toString());
    formData.set("start_time", times.start_time);
    formData.set("end_time", times.end_time);

    startTransition(async () => {
      const result = await updateAvailabilitySlot(formData);
      handleActionResult(result, () => {
        toast.success("Slot updated.");
        setEditingId(null);
        setTimes(defaultTimes);
        setPendingAction(null);
      });
      if (result.requiresConfirmation) {
        setPendingAction(action);
      }
    });
  };

  const handleDelete = (slotId: string) => {
    const action: PendingAction = { type: "delete", slotId };
    setPendingAction(action);

    const formData = new FormData();
    formData.set("id", slotId);

    startTransition(async () => {
      const result = await deleteAvailabilitySlot(formData);
      handleActionResult(result, () => {
        toast.success("Slot removed.");
        setPendingAction(null);
      });
      if (result.requiresConfirmation) {
        setPendingAction(action);
      }
    });
  };

  const startAdd = (day: number) => {
    setAddingDay(day);
    setEditingId(null);
    setTimes(defaultTimes);
  };

  const startEdit = (slot: TeacherAvailability) => {
    setEditingId(slot.id);
    setAddingDay(null);
    setTimes({
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
    });
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scheduled classes conflict</AlertDialogTitle>
            <AlertDialogDescription>
              Removing or changing this slot affects classes that rely on this
              availability. Accepted classes will remain scheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {conflicts.map((conflict) => (
              <li
                key={`${conflict.class_id}-${conflict.session_id ?? "proposed"}`}
              >
                {conflictDescription(conflict)}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingAction(null);
                setConflicts([]);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => executePendingAction(true)}
            >
              Remove anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h2 className="font-heading text-lg font-semibold">Weekly availability</h2>
        <p className="text-sm text-muted-foreground">
          Hours you&apos;re free to teach. Schools use this when finding you.
          Add as many time blocks as you need under each day.
        </p>
      </div>

      <div className="space-y-4">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = grouped.get(day.value) ?? [];
          const isAdding = addingDay === day.value;

          return (
            <Card key={day.value}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{day.label}</CardTitle>
                  <CardDescription>
                    {daySlots.length === 0
                      ? "No slots yet"
                      : `${daySlots.length} slot${daySlots.length === 1 ? "" : "s"}`}
                  </CardDescription>
                </div>
                {!isAdding && editingId === null && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startAdd(day.value)}
                  >
                    <PlusIcon className="size-4" />
                    Add slot
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {daySlots.map((slot) =>
                  editingId === slot.id ? (
                    <div
                      key={slot.id}
                      className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
                    >
                      <TimeFields
                        idPrefix={`edit-${slot.id}`}
                        times={times}
                        onChange={setTimes}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleUpdate(slot.id, day.value)}
                        >
                          {isPending ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setTimes(defaultTimes);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                    >
                      <span className="text-sm font-medium">
                        {formatTime(slot.start_time.slice(0, 5))} –{" "}
                        {formatTime(slot.end_time.slice(0, 5))}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => startEdit(slot)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDelete(slot.id)}
                          disabled={isPending}
                        >
                          <Trash2Icon className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ),
                )}

                {isAdding && (
                  <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-muted/30 p-4">
                    <TimeFields
                      idPrefix={`add-${day.value}`}
                      times={times}
                      onChange={setTimes}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleAdd(day.value)}
                      >
                        {isPending ? "Adding…" : "Add slot"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingDay(null);
                          setTimes(defaultTimes);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
