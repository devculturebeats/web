"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  matchTeachersForAcademy,
  requestTeacherForAcademy,
} from "@/app/(app)/academy/actions";
import { RecurrenceFields } from "@/components/school/recurrence-fields";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";
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
import {
  formatRecurrenceLabel,
  type RecurrenceMode,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { WeekDaySlot } from "@/lib/week-slots";
import type { AcademyMemberTeacher, Organization } from "@/types/database";

const findSchema = z.object({
  name: z.string().optional(),
  skill: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  filter_free: z.boolean().optional(),
});

const requestDetailsSchema = z.object({
  message: z.string().optional(),
  request_skill: z.string().min(1, "Skill is required for the class request"),
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

function skillsLabel(match: AcademyMemberTeacher): string {
  const skills = [
    match.primary_skill,
    ...(match.secondary_skills ?? []),
  ].filter(Boolean);
  return skills.join(" · ");
}

export function AcademyFindTeachers({ org }: { org: Organization }) {
  const [matches, setMatches] = useState<AcademyMemberTeacher[]>([]);
  const [slotFilters, setSlotFilters] = useState<SlotFilters | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [slotStart, setSlotStart] = useState("17:00");
  const [slotEnd, setSlotEnd] = useState("18:00");
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>("once");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [pendingAction, setPendingAction] =
    useState<AcademyMemberTeacher | null>(null);
  const [forceMode, setForceMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isApproved = org.approval_status === "approved";

  const findForm = useForm<FindFormValues>({
    resolver: zodResolver(findSchema),
    defaultValues: {
      name: "",
      skill: "",
      email: "",
      phone: "",
      filter_free: false,
    },
  });

  const detailsForm = useForm<RequestDetailsValues>({
    resolver: zodResolver(requestDetailsSchema),
    defaultValues: {
      message: "",
      request_skill: "",
    },
  });

  const filterFree = findForm.watch("filter_free");

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
      start: `${slotStart}:00`.slice(0, 8),
      end: `${slotEnd}:00`.slice(0, 8),
    }));
  };

  const onFindTeachers = (values: FindFormValues) => {
    let weekDays: WeekDaySlot[] = [];

    if (values.filter_free) {
      const collected = collectWeekDays();
      if (!collected) return;
      weekDays = collected;
    } else if (selectedDays.length > 0) {
      // Keep selected days for a later class request even when not filtering free.
      if (!slotStart || !slotEnd || slotStart >= slotEnd) {
        toast.error("End time must be after start time.");
        return;
      }
      weekDays = selectedDays.map((day) => ({
        day,
        start: `${slotStart}:00`.slice(0, 8),
        end: `${slotEnd}:00`.slice(0, 8),
      }));
    }

    const formData = new FormData();
    if (values.name) formData.set("name", values.name);
    if (values.skill) formData.set("skill", values.skill);
    if (values.email) formData.set("email", values.email);
    if (values.phone) formData.set("phone", values.phone);
    if (values.filter_free) formData.set("filter_free", "true");
    if (weekDays.length > 0) {
      formData.set("week_days", JSON.stringify(weekDays));
    }

    startTransition(async () => {
      const result = await matchTeachersForAcademy(formData);
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
      setForceMode(false);
      detailsForm.reset({
        message: "",
        request_skill: values.skill || "",
      });
      if ((result.matches ?? []).length === 0) {
        toast.info(
          values.filter_free
            ? "No academy teachers match those filters and free times."
            : "No linked teachers match those filters. Invite teachers from Discover teachers first.",
        );
      }
    });
  };

  const openTeacherAction = (
    teacher: AcademyMemberTeacher,
    force = false,
  ) => {
    if (!slotFilters || slotFilters.weekDays.length === 0) {
      toast.error(
        "Select days and times first, then request this teacher for a class.",
      );
      return;
    }
    detailsForm.clearErrors();
    detailsForm.setValue(
      "request_skill",
      slotFilters.skill || teacher.primary_skill || "",
    );
    setForceMode(force);
    setPendingAction(teacher);
  };

  const closeTeacherAction = () => {
    if (isPending) return;
    setPendingAction(null);
    setForceMode(false);
    detailsForm.reset({ message: "", request_skill: slotFilters?.skill || "" });
  };

  const confirmTeacherAction = detailsForm.handleSubmit((details) => {
    if (!pendingAction || !slotFilters || slotFilters.weekDays.length === 0) {
      return;
    }
    const formData = new FormData();
    formData.set("skill", details.request_skill);
    formData.set("week_days", JSON.stringify(slotFilters.weekDays));
    formData.set("teacher_id", pendingAction.teacher_id);
    formData.set("recurrence_mode", slotFilters.recurrenceMode);
    if (
      slotFilters.recurrenceMode === "until_date" &&
      slotFilters.recurrenceUntil
    ) {
      formData.set("recurrence_until", slotFilters.recurrenceUntil);
    }
    if (details.message) formData.set("message", details.message);
    if (forceMode) formData.set("force", "true");

    startTransition(async () => {
      const result = await requestTeacherForAcademy(formData);
      if (result.error) {
        if (result.warning && !forceMode) {
          toast.error(result.error);
          setForceMode(true);
          toast.message(
            "Click send again to force the request despite availability.",
          );
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success(
        forceMode
          ? "Force request sent to teacher."
          : "Request sent to teacher.",
      );
      setMatches([]);
      setSlotFilters(null);
      setPendingAction(null);
      setForceMode(false);
      detailsForm.reset();
    });
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Assign teachers to classes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only teachers linked to your academy appear here. Discover and invite
          new teachers from the Discover teachers tab first.
        </p>
      </div>

      <form
        onSubmit={findForm.handleSubmit(onFindTeachers)}
        className="space-y-5"
      >
        <fieldset disabled={!isApproved || isPending} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="find-name">Name</Label>
              <Input
                id="find-name"
                placeholder="Teacher name"
                {...findForm.register("name")}
              />
            </div>
            <div className="space-y-2">
              <Label>Skill (primary or secondary)</Label>
              <Controller
                name="skill"
                control={findForm.control}
                render={({ field }) => (
                  <Select
                    value={field.value || "any"}
                    onValueChange={(v) => field.onChange(v === "any" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any skill" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any skill</SelectItem>
                      {ART_SKILLS.map((skill) => (
                        <SelectItem key={skill} value={skill}>
                          {skill}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="find-email">Email</Label>
              <Input
                id="find-email"
                type="email"
                placeholder="teacher@example.com"
                {...findForm.register("email")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="find-phone">Contact number</Label>
              <Input
                id="find-phone"
                placeholder="Phone or WhatsApp"
                {...findForm.register("phone")}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!filterFree}
              onChange={(e) =>
                findForm.setValue("filter_free", e.target.checked)
              }
            />
            <span>
              <span className="font-medium">Only free for selected times</span>
              <span className="mt-0.5 block text-muted-foreground">
                Uses their weekly availability and skips teachers already
                booked.
              </span>
            </span>
          </label>

          <div className="space-y-3">
            <Label>
              Days{filterFree ? " *" : " (for class request)"}
            </Label>
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
            <Label>Time{filterFree ? " *" : ""}</Label>
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
              {matches.length}{" "}
              {matches.length === 1 ? "teacher" : "teachers"}
            </h3>
            {slotFilters.weekDays.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {formatWeekDaysLabel(slotFilters.weekDays)}
                {" · "}
                {formatRecurrenceLabel({
                  mode: slotFilters.recurrenceMode,
                  until: slotFilters.recurrenceUntil,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select days and times above before sending a class request.
              </p>
            )}
          </div>

          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching teachers in your academy.
            </p>
          ) : (
            <PaginatedList items={matches} pageSize={10} label="teachers">
              {(pageItems) => (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {pageItems.map((match) => (
                    <li
                      key={match.teacher_id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{match.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {skillsLabel(match) || "No skills listed"}
                          {match.city ? ` · ${match.city}` : ""}
                          {match.years_of_experience != null
                            ? ` · ${match.years_of_experience} yrs`
                            : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {match.email}
                          {match.phone ? ` · ${match.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!isApproved || isPending}
                          onClick={() => openTeacherAction(match, false)}
                        >
                          Request
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isApproved || isPending}
                          onClick={() => openTeacherAction(match, true)}
                        >
                          Force request
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PaginatedList>
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
            <DialogTitle>
              {forceMode ? "Force request" : "Request"}{" "}
              {pendingAction?.full_name}
            </DialogTitle>
            <DialogDescription>
              {forceMode
                ? "This ignores availability conflicts. The teacher can still accept or reject."
                : null}
              {slotFilters && slotFilters.weekDays.length > 0 ? (
                <>
                  {forceMode ? " " : null}
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

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Class skill</Label>
              <Controller
                name="request_skill"
                control={detailsForm.control}
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
              {detailsForm.formState.errors.request_skill ? (
                <p className="text-sm text-destructive">
                  {detailsForm.formState.errors.request_skill.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Request message</Label>
              <Textarea
                id="message"
                placeholder="Optional"
                rows={3}
                {...detailsForm.register("message")}
              />
            </div>
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
              {isPending
                ? "Sending…"
                : forceMode
                  ? "Confirm force request"
                  : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
