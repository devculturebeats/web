"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  assignTeacherDirectly,
  cancelClass,
  matchTeachersForSlot,
  requestTeacher,
  scheduleClassSessions,
  sendNotification,
} from "@/app/(app)/school/actions";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ApprovalBadge } from "@/components/org/approval-badge";
import { AuditLogList } from "@/components/admin/audit-log-list";
import { BatchesPanel } from "@/components/org/batches-panel";
import { CancelClassDialog } from "@/components/org/cancel-class-dialog";
import { NotifyPanel } from "@/components/org/notify-panel";
import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { StudentsPanel, type LinkedStudent } from "@/components/org/students-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ART_SKILLS, DAYS_OF_WEEK } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { SERVICE_CITIES } from "@/lib/locations";
import type { WeekDaySlot } from "@/lib/week-slots";
import type { AuditLogWithActor } from "@/lib/audit";
import type {
  Batch,
  ClassRow,
  ClassSession,
  Organization,
  TeacherMatch,
} from "@/types/database";

const findSchema = z.object({
  skill: z.string().min(1, "Skill is required"),
  city: z.string().optional(),
});

const requestDetailsSchema = z.object({
  title: z.string().min(1, "Class title is required"),
  batch_id: z.string().optional(),
  message: z.string().optional(),
});

type FindFormValues = z.infer<typeof findSchema>;
type RequestDetailsValues = z.infer<typeof requestDetailsSchema>;

type TimeSlot = { start: string; end: string };
type DayTiming = { enabled: boolean; slots: TimeSlot[] };

type SlotFilters = FindFormValues & {
  weekDays: WeekDaySlot[];
};

function defaultSlot(): TimeSlot {
  return { start: "17:00", end: "18:00" };
}

function emptyTimings(): Record<number, DayTiming> {
  const map: Record<number, DayTiming> = {};
  for (const day of DAYS_OF_WEEK) {
    map[day.value] = { enabled: false, slots: [defaultSlot()] };
  }
  return map;
}

function timesOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

function slotsOverlap(slots: TimeSlot[]): boolean {
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (timesOverlap(slots[i], slots[j])) return true;
    }
  }
  return false;
}

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

export type SchoolClass = ClassRow & {
  sessions: ClassSession[];
  teacher: { profiles: { full_name: string } | null } | null;
};

type SchoolPortalProps = {
  org: Organization;
  batches: Batch[];
  students: LinkedStudent[];
  classes: SchoolClass[];
  auditLogs: AuditLogWithActor[];
};

export function SchoolPortal({
  org,
  batches,
  students,
  classes,
  auditLogs,
}: SchoolPortalProps) {
  const [matches, setMatches] = useState<TeacherMatch[]>([]);
  const [slotFilters, setSlotFilters] = useState<SlotFilters | null>(null);
  const [timings, setTimings] = useState(emptyTimings);
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
      title: "",
      batch_id: "",
      message: "",
    },
  });

  const selectedDays = useMemo(
    () => DAYS_OF_WEEK.filter((day) => timings[day.value].enabled),
    [timings],
  );

  const collectWeekDays = (): WeekDaySlot[] | null => {
    if (selectedDays.length === 0) {
      toast.error("Select at least one day.");
      return null;
    }

    for (const day of selectedDays) {
      const { slots } = timings[day.value];
      if (slots.length === 0) {
        toast.error(`Add at least one time slot for ${day.label}.`);
        return null;
      }
      for (const slot of slots) {
        if (!slot.start || !slot.end || slot.start >= slot.end) {
          toast.error(
            `${day.label}: each slot needs an end time after the start.`,
          );
          return null;
        }
      }
      if (slotsOverlap(slots)) {
        toast.error(
          `${day.label}: time slots overlap. Adjust them so they don’t clash.`,
        );
        return null;
      }
    }

    return selectedDays.flatMap((day) =>
      timings[day.value].slots.map((slot) => ({
        day: day.value,
        start: slot.start,
        end: slot.end,
      })),
    );
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
      setSlotFilters({ ...values, weekDays });
      if ((result.matches ?? []).length === 0) {
        toast.info(
          "No teachers cover all selected days and times. Try fewer days or different hours.",
        );
      }
    });
  };

  const buildActionFormData = (
    teacherId: string,
    details: RequestDetailsValues,
  ) => {
    if (!slotFilters) return null;
    const formData = new FormData();
    formData.set("skill", slotFilters.skill);
    if (slotFilters.city) formData.set("city", slotFilters.city);
    formData.set("week_days", JSON.stringify(slotFilters.weekDays));
    Object.entries(details).forEach(([key, val]) => {
      if (val) formData.set(key, val);
    });
    formData.set("teacher_id", teacherId);
    return formData;
  };

  const setDayEnabled = (day: number, enabled: boolean) => {
    setTimings((prev) => ({
      ...prev,
      [day]: {
        enabled,
        slots: enabled
          ? prev[day].slots.length > 0
            ? prev[day].slots
            : [defaultSlot()]
          : prev[day].slots,
      },
    }));
  };

  const updateSlot = (
    day: number,
    index: number,
    field: keyof TimeSlot,
    value: string,
  ) => {
    setTimings((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map((slot, i) =>
          i === index ? { ...slot, [field]: value } : slot,
        ),
      },
    }));
  };

  const addSlot = (day: number) => {
    setTimings((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, defaultSlot()],
      },
    }));
  };

  const removeSlot = (day: number, index: number) => {
    setTimings((prev) => {
      const nextSlots = prev[day].slots.filter((_, i) => i !== index);
      return {
        ...prev,
        [day]: {
          ...prev[day],
          slots: nextSlots.length > 0 ? nextSlots : [defaultSlot()],
        },
      };
    });
  };

  const handleRequest = (teacherId: string) => {
    detailsForm.handleSubmit((details) => {
      const formData = buildActionFormData(teacherId, details);
      if (!formData) return;

      startTransition(async () => {
        const result = await requestTeacher(formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Request sent to teacher.");
        setMatches([]);
        setSlotFilters(null);
        detailsForm.reset();
      });
    })();
  };

  const handleAssignDirectly = (teacherId: string) => {
    detailsForm.handleSubmit((details) => {
      const formData = buildActionFormData(teacherId, details);
      if (!formData) return;

      startTransition(async () => {
        const result = await assignTeacherDirectly(formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Teacher assigned and sessions scheduled.");
        setMatches([]);
        setSlotFilters(null);
        detailsForm.reset();
      });
    })();
  };

  const handleSchedule = (classId: string, form: HTMLFormElement) => {
    const formData = new FormData(form);
    formData.set("class_id", classId);

    startTransition(async () => {
      const result = await scheduleClassSessions(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Sessions scheduled.");
      form.reset();
    });
  };

  const handleCancelClass = async (classId: string, reason: string) => {
    const result = await cancelClass(classId, reason.trim() || undefined);
    if (result.error) return { error: result.error };
  };

  const notifyClasses = classes.map((cls) => ({ id: cls.id, title: cls.title }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[org.city, org.area].filter(Boolean).join(", ") || "School portal"}
          </p>
        </div>
        <ApprovalBadge status={org.approval_status} />
      </div>

      <PendingApprovalBanner status={org.approval_status} />

      <Tabs defaultValue="request">
        <TabsList className="w-full flex-wrap justify-start">
          <TabsTrigger value="request">Request teacher</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="notify">Notify</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-4">
          <BatchesPanel batches={batches} disabled={!isApproved} />
        </TabsContent>

        <TabsContent value="request" className="mt-4 space-y-4">
          <form
            onSubmit={findForm.handleSubmit(onFindTeachers)}
            className="space-y-4 rounded-lg border p-4"
          >
            <fieldset disabled={!isApproved || isPending} className="space-y-4">
              <div>
                <h3 className="font-medium">Find teachers</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Match by skill (primary or secondary) and availability across
                  every day you select. Each day can have its own times.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    Skill <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="skill"
                    control={findForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
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
                <div className="space-y-2">
                  <Label>City (optional)</Label>
                  <Controller
                    name="city"
                    control={findForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value || "any"}
                        onValueChange={(v) =>
                          field.onChange(v === "any" ? "" : v)
                        }
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
                <div>
                  <Label>
                    Days & times <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable days, then set times per day (e.g. Monday 5–6 PM,
                    Wednesday 4–5 PM).
                  </p>
                </div>
                <div className="space-y-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const timing = timings[day.value];
                    return (
                      <div
                        key={day.value}
                        className="rounded-lg border border-border px-3 py-2.5"
                      >
                        <div className="flex min-w-28 items-center gap-2">
                          <Checkbox
                            id={`school-day-${day.value}`}
                            checked={timing.enabled}
                            onCheckedChange={(checked) =>
                              setDayEnabled(day.value, checked === true)
                            }
                          />
                          <Label
                            htmlFor={`school-day-${day.value}`}
                            className="font-normal"
                          >
                            {day.label}
                          </Label>
                        </div>

                        {timing.enabled && (
                          <div className="mt-3 space-y-2">
                            {timing.slots.map((slot, index) => (
                              <div
                                key={`${day.value}-${index}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <Input
                                  type="time"
                                  className="w-auto"
                                  value={slot.start}
                                  onChange={(e) =>
                                    updateSlot(
                                      day.value,
                                      index,
                                      "start",
                                      e.target.value,
                                    )
                                  }
                                  aria-label={`${day.label} slot ${index + 1} start`}
                                />
                                <span className="text-xs text-muted-foreground">
                                  to
                                </span>
                                <Input
                                  type="time"
                                  className="w-auto"
                                  value={slot.end}
                                  onChange={(e) =>
                                    updateSlot(
                                      day.value,
                                      index,
                                      "end",
                                      e.target.value,
                                    )
                                  }
                                  aria-label={`${day.label} slot ${index + 1} end`}
                                />
                                {timing.slots.length > 1 && (
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() =>
                                      removeSlot(day.value, index)
                                    }
                                    aria-label={`Remove ${day.label} slot ${index + 1}`}
                                  >
                                    <Trash2Icon className="size-3.5 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addSlot(day.value)}
                            >
                              <PlusIcon className="size-3.5" />
                              Add time on {day.label}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" disabled={!isApproved || isPending}>
                {isPending ? "Searching…" : "Find available teachers"}
              </Button>
            </fieldset>
          </form>

          {slotFilters && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Looking for teachers free for:{" "}
                <span className="font-medium text-foreground">
                  {formatWeekDaysLabel(slotFilters.weekDays)}
                </span>
              </p>

              <div className="rounded-lg border border-dashed p-4 space-y-4">
                <div>
                  <h3 className="font-medium">Class details for request</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Used when you request or assign a teacher from the list
                    below.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Class title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g. Weekly Bharatanatyam"
                    {...detailsForm.register("title")}
                  />
                  {detailsForm.formState.errors.title && (
                    <p className="text-sm text-destructive">
                      {detailsForm.formState.errors.title.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {batches.length > 0 && (
                    <div className="space-y-2">
                      <Label>Batch (optional)</Label>
                      <Controller
                        name="batch_id"
                        control={detailsForm.control}
                        render={({ field }) => (
                          <Select
                            value={field.value || "none"}
                            onValueChange={(v) =>
                              field.onChange(v === "none" ? "" : v)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select batch" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No batch</SelectItem>
                              {batches.map((batch) => (
                                <SelectItem key={batch.id} value={batch.id}>
                                  {batch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  )}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="message">Notes for the teacher</Label>
                    <Textarea
                      id="message"
                      placeholder="Optional message"
                      rows={2}
                      {...detailsForm.register("message")}
                    />
                  </div>
                </div>
              </div>

              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teachers available for all selected days and times.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {matches.length} teacher
                    {matches.length === 1 ? "" : "s"} free for every selected
                    slot. <strong>Request</strong> asks for consent.{" "}
                    <strong>Assign</strong> books them and creates the first
                    sessions.
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {matches.map((match) => (
                      <li
                        key={match.teacher_id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
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
                            variant="outline"
                            disabled={!isApproved || isPending}
                            onClick={() => handleRequest(match.teacher_id)}
                          >
                            Request
                          </Button>
                          <Button
                            size="sm"
                            disabled={!isApproved || isPending}
                            onClick={() =>
                              handleAssignDirectly(match.teacher_id)
                            }
                          >
                            Assign
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="classes" className="mt-4">
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <ul className="space-y-4">
              {classes.map((cls) => {
                const upcoming = [...cls.sessions]
                  .sort(
                    (a, b) =>
                      new Date(a.starts_at).getTime() -
                      new Date(b.starts_at).getTime(),
                  )
                  .slice(0, 3);

                return (
                  <li key={cls.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          <Link
                            href={`/classes/${cls.id}`}
                            className="hover:underline"
                          >
                            {cls.title}
                          </Link>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {cls.skill}
                          {cls.teacher?.profiles?.full_name
                            ? ` · ${cls.teacher.profiles.full_name}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <LifecycleBadge status={cls.status} />
                        {cls.status !== "cancelled" && (
                          <CancelClassDialog
                            classTitle={cls.title}
                            disabled={!isApproved}
                            onConfirm={(reason) => handleCancelClass(cls.id, reason)}
                          />
                        )}
                      </div>
                    </div>

                    {cls.sessions.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {upcoming.map((session) => (
                            <li key={session.id} className="flex flex-wrap items-center gap-2">
                              <span>
                                {new Date(session.starts_at).toLocaleString()} –{" "}
                                {new Date(session.ends_at).toLocaleTimeString()}
                              </span>
                              <LifecycleBadge status={session.status} />
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={`/classes/${cls.id}`}
                          className="inline-block text-sm font-medium text-primary hover:underline"
                        >
                          Open class
                        </Link>
                      </div>
                    ) : (
                      cls.status === "accepted" && (
                        <form
                          className="mt-3 space-y-3 rounded-md border border-dashed p-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSchedule(cls.id, e.currentTarget);
                          }}
                        >
                          <fieldset disabled={!isApproved || isPending} className="space-y-3">
                            <p className="text-sm font-medium">Schedule sessions</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor={`start-${cls.id}`}>Start</Label>
                                <Input
                                  id={`start-${cls.id}`}
                                  name="starts_at"
                                  type="datetime-local"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`end-${cls.id}`}>End</Label>
                                <Input
                                  id={`end-${cls.id}`}
                                  name="ends_at"
                                  type="datetime-local"
                                  required
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`weeks-${cls.id}`}>
                                Extra weekly repeats (0 = just once, up to 8)
                              </Label>
                              <Input
                                id={`weeks-${cls.id}`}
                                name="recurring_weeks"
                                type="number"
                                min={0}
                                max={8}
                                defaultValue={0}
                              />
                            </div>
                            <Button type="submit" size="sm">
                              Create sessions
                            </Button>
                          </fieldset>
                        </form>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <StudentsPanel
            students={students}
            batches={batches}
            disabled={!isApproved}
          />
        </TabsContent>

        <TabsContent value="notify" className="mt-4">
          <NotifyPanel
            classes={notifyClasses}
            disabled={!isApproved}
            onSend={sendNotification}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <AuditLogList logs={auditLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
