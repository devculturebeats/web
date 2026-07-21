"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  matchTeachersForSlot,
  requestTeacher,
} from "@/app/(app)/school/actions";
import { RecurrenceFields } from "@/components/school/recurrence-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ART_SKILLS, DAYS_OF_WEEK } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { SERVICE_CITIES } from "@/lib/locations";
import {
  formatRecurrenceLabel,
  type RecurrenceMode,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { WeekDaySlot } from "@/lib/week-slots";
import type { Organization, TeacherMatch } from "@/types/database";

const findSchema = z.object({
  skill: z.string().min(1, "Skill is required"),
  city: z.string().optional(),
});

const requestDetailsSchema = z.object({
  message: z.string().optional(),
});

type FindFormValues = z.infer<typeof findSchema>;
type RequestDetailsValues = z.infer<typeof requestDetailsSchema>;

type SlotFilters = FindFormValues & {
  weekDays: WeekDaySlot[];
  recurrenceMode: RecurrenceMode;
  recurrenceUntil: string;
};

function formatWeekDaysLabel(weekDays: WeekDaySlot[]): string {
  return weekDays
    .map((slot) => {
      const day =
        DAYS_OF_WEEK.find((d) => d.value === slot.day)?.label ??
        `Day ${slot.day}`;
      return `${day} ${formatTime(slot.start.slice(0, 5))}–${formatTime(slot.end.slice(0, 5))}`;
    })
    .join(" · ");
}

export function SchoolRequestTeachers({ org }: { org: Organization }) {
  const [matches, setMatches] = useState<TeacherMatch[]>([]);
  const [slotFilters, setSlotFilters] = useState<SlotFilters | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [slotStart, setSlotStart] = useState("17:00");
  const [slotEnd, setSlotEnd] = useState("18:00");
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>("once");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [pendingAction, setPendingAction] = useState<TeacherMatch | null>(null);
  const [isPending, startTransition] = useTransition();

  const isApproved = org.approval_status === "approved";

  const findForm = useForm<FindFormValues>({
    resolver: zodResolver(findSchema),
    defaultValues: {
      skill: "",
      city: org.city || "",
    },
  });

  const detailsForm = useForm<RequestDetailsValues>({
    resolver: zodResolver(requestDetailsSchema),
    defaultValues: {
      message: "",
    },
  });

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const collectWeekDays = (): WeekDaySlot[] | null => {
    if (selectedDays.length === 0) {
      toast.error("Select at least one day.");
      return null;
    }
    if (!slotStart || !slotEnd || slotStart >= slotEnd) {
      toast.error("End time must be after start time.");
      return null;
    }
    if (recurrenceMode === "until_date" && !recurrenceUntil) {
      toast.error("Pick an end date for weekly classes.");
      return null;
    }

    return selectedDays.map((day) => ({
      day,
      start: slotStart,
      end: slotEnd,
    }));
  };

  const onFindTeachers = (values: FindFormValues) => {
    const weekDays = collectWeekDays();
    if (!weekDays) return;

    const formData = new FormData();
    formData.set("skill", values.skill);
    if (values.city) formData.set("city", values.city);
    formData.set("week_days", JSON.stringify(weekDays));

    startTransition(async () => {
      const result = await matchTeachersForSlot(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setMatches(result.matches ?? []);
      setSlotFilters({
        ...values,
        weekDays,
        recurrenceMode,
        recurrenceUntil,
      });
      setPendingAction(null);
      detailsForm.reset();
      if ((result.matches ?? []).length === 0) {
        toast.info(
          "No teachers free for those days and times. Try different hours.",
        );
      }
    });
  };

  const openTeacherAction = (teacher: TeacherMatch) => {
    detailsForm.clearErrors();
    setPendingAction(teacher);
  };

  const closeTeacherAction = () => {
    if (isPending) return;
    setPendingAction(null);
    detailsForm.reset();
  };

  const confirmTeacherAction = detailsForm.handleSubmit((details) => {
    if (!pendingAction || !slotFilters) return;
    const formData = new FormData();
    formData.set("skill", slotFilters.skill);
    if (slotFilters.city) formData.set("city", slotFilters.city);
    formData.set("week_days", JSON.stringify(slotFilters.weekDays));
    formData.set("teacher_id", pendingAction.teacher_id);
    formData.set("recurrence_mode", slotFilters.recurrenceMode);
    if (slotFilters.recurrenceMode === "until_date" && slotFilters.recurrenceUntil) {
      formData.set("recurrence_until", slotFilters.recurrenceUntil);
    }
    if (details.message) formData.set("message", details.message);

    startTransition(async () => {
      const result = await requestTeacher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Request sent to teacher.");
      setMatches([]);
      setSlotFilters(null);
      setPendingAction(null);
      detailsForm.reset();
    });
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={findForm.handleSubmit(onFindTeachers)}
        className="space-y-5"
      >
        <fieldset disabled={!isApproved || isPending} className="space-y-5">
          <div className="flex max-w-xl flex-col gap-4 sm:flex-row">
            <div className="w-full space-y-2 sm:w-56">
              <Label>Skill</Label>
              <Controller
                name="skill"
                control={findForm.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select skill" />
                    </SelectTrigger>
                    <SelectContent>
                      {ART_SKILLS.map((skill) => (
                        <SelectItem key={skill} value={skill}>
                          {skill}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {findForm.formState.errors.skill && (
                <p className="text-sm text-destructive">
                  {findForm.formState.errors.skill.message}
                </p>
              )}
            </div>
            <div className="w-full space-y-2 sm:w-48">
              <Label>City</Label>
              <Controller
                name="city"
                control={findForm.control}
                render={({ field }) => (
                  <Select
                    value={field.value || "any"}
                    onValueChange={(v) => field.onChange(v === "any" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any city" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any city</SelectItem>
                      {SERVICE_CITIES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const active = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {day.label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Time</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                className="w-auto"
                value={slotStart}
                onChange={(e) => setSlotStart(e.target.value)}
                aria-label="Start time"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                className="w-auto"
                value={slotEnd}
                onChange={(e) => setSlotEnd(e.target.value)}
                aria-label="End time"
              />
            </div>
          </div>

          <RecurrenceFields
            mode={recurrenceMode}
            until={recurrenceUntil}
            onModeChange={setRecurrenceMode}
            onUntilChange={setRecurrenceUntil}
            disabled={!isApproved || isPending}
          />

          <Button type="submit" disabled={!isApproved || isPending}>
            {isPending ? "Searching…" : "Find teachers"}
          </Button>
        </fieldset>
      </form>

      {slotFilters && (
        <div className="space-y-3">
          <div>
            <h3 className="font-heading text-lg font-semibold">
              {matches.length} available
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatWeekDaysLabel(slotFilters.weekDays)}
              {" · "}
              {formatRecurrenceLabel({
                mode: slotFilters.recurrenceMode,
                until: slotFilters.recurrenceUntil,
              })}
            </p>
          </div>

          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teachers free for these days and times.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {matches.map((match) => (
                <li
                  key={match.teacher_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{match.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {match.primary_skill}
                      {match.city ? ` · ${match.city}` : ""}
                      {match.years_of_experience != null
                        ? ` · ${match.years_of_experience} yrs`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!isApproved || isPending}
                      onClick={() => openTeacherAction(match)}
                    >
                      Request
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog
        open={pendingAction != null}
        onOpenChange={(open) => {
          if (!open) closeTeacherAction();
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>Request {pendingAction?.full_name}</DialogTitle>
            <DialogDescription>
              {slotFilters ? (
                <>
                  {formatWeekDaysLabel(slotFilters.weekDays)}
                  {" · "}
                  {formatRecurrenceLabel({
                    mode: slotFilters.recurrenceMode,
                    until: slotFilters.recurrenceUntil,
                  })}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="message">Request message</Label>
            <Textarea
              id="message"
              placeholder="Optional"
              rows={3}
              {...detailsForm.register("message")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeTeacherAction}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!isApproved || isPending}
              onClick={() => void confirmTeacherAction()}
            >
              {isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
