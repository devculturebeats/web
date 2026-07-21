"use client";

import { useMemo, useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { createHomeStudioClass } from "@/app/(app)/teacher/classes/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ART_SKILLS,
  DAYS_OF_WEEK,
  RATE_UNITS,
} from "@/lib/constants";

const LOCATION_OPTIONS = [
  { value: "home_studio", label: "Home studio" },
  { value: "online", label: "Online" },
  { value: "venue", label: "Studio / venue" },
] as const;

type TimeSlot = {
  start: string;
  end: string;
};

type DayTiming = {
  enabled: boolean;
  slots: TimeSlot[];
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

export function HomeStudioClassForm({ canPost }: { canPost: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState<string>(ART_SKILLS[0]);
  const [locationType, setLocationType] = useState("home_studio");
  const [rateUnit, setRateUnit] = useState("hour");
  const [timings, setTimings] = useState(emptyTimings);

  const selectedDays = useMemo(
    () => DAYS_OF_WEEK.filter((day) => timings[day.value].enabled),
    [timings],
  );

  if (!canPost) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a class</CardTitle>
          <CardDescription>
            Once your teacher profile is approved, you can post classes students
            join directly.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-primary/25 bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Create a new class</p>
          <p className="text-sm text-muted-foreground">
            Set your days, times, and rate. Students can enroll themselves.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Create class
        </Button>
      </div>
    );
  }

  const handleSubmit = (formData: FormData) => {
    if (selectedDays.length === 0) {
      toast.error("Select at least one day with timings.");
      return;
    }

    for (const day of selectedDays) {
      const { slots } = timings[day.value];
      if (slots.length === 0) {
        toast.error(`Add at least one time slot for ${day.label}.`);
        return;
      }
      for (const slot of slots) {
        if (!slot.start || !slot.end || slot.start >= slot.end) {
          toast.error(
            `${day.label}: each slot needs an end time after the start.`,
          );
          return;
        }
      }
      if (slotsOverlap(slots)) {
        toast.error(
          `${day.label}: time slots overlap. Adjust them so they don’t clash.`,
        );
        return;
      }
    }

    const weekDays = selectedDays.flatMap((day) =>
      timings[day.value].slots.map((slot) => ({
        day: day.value,
        start: slot.start,
        end: slot.end,
      })),
    );

    formData.set("skill", skill);
    formData.set("location_type", locationType);
    formData.set("rate_unit", rateUnit);
    formData.set("week_days", JSON.stringify(weekDays));

    startTransition(async () => {
      const result = await createHomeStudioClass(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Class published");
      setOpen(false);
      setTimings(emptyTimings());
    });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create a class</CardTitle>
        <CardDescription>
          Pick days you teach and add as many time slots as you need on each
          day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="home_title">Title</Label>
            <Input
              id="home_title"
              name="title"
              required
              placeholder="Eg. Bharatanatyam foundations"
              disabled={isPending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Skill</Label>
              <Select
                value={skill}
                onValueChange={(value) => {
                  if (value) setSkill(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ART_SKILLS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Where</Label>
              <Select
                value={locationType}
                onValueChange={(value) => {
                  if (value) setLocationType(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_description">Description</Label>
            <Textarea
              id="home_description"
              name="description"
              rows={3}
              placeholder="What students will learn, level, what to bring…"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_location_note">Location note</Label>
            <Input
              id="home_location_note"
              name="location_note"
              placeholder="Area / city — exact address can wait until enrollment"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="starts_from">First week starts on</Label>
            <Input
              id="starts_from"
              name="starts_from"
              type="date"
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label>Weekly days & times</Label>
              <p className="text-xs text-muted-foreground">
                Enable a day, then add multiple slots (e.g. morning and evening).
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
                        id={`day-${day.value}`}
                        checked={timing.enabled}
                        onCheckedChange={(checked) =>
                          setDayEnabled(day.value, checked === true)
                        }
                      />
                      <Label
                        htmlFor={`day-${day.value}`}
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
                              disabled={isPending}
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
                              disabled={isPending}
                              aria-label={`${day.label} slot ${index + 1} end`}
                            />
                            {timing.slots.length > 1 && (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={isPending}
                                onClick={() => removeSlot(day.value, index)}
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
                          disabled={isPending}
                          onClick={() => addSlot(day.value)}
                        >
                          <PlusIcon className="size-3.5" />
                          Add slot
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="home_rate">Rate (₹)</Label>
              <Input
                id="home_rate"
                name="rate_amount"
                type="number"
                min={0}
                step={50}
                placeholder="800"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate unit</Label>
              <Select
                value={rateUnit}
                onValueChange={(value) => {
                  if (value) setRateUnit(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_UNITS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="home_capacity">Max students</Label>
              <Input
                id="home_capacity"
                name="max_students"
                type="number"
                min={1}
                placeholder="6"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_weeks">Repeat for next weeks (0–8)</Label>
            <Input
              id="home_weeks"
              name="recurring_weeks"
              type="number"
              min={0}
              max={8}
              defaultValue={3}
              disabled={isPending}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Publishing…" : "Publish class"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
