"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { submitTeacherNeed } from "@/app/(app)/school/actions";
import { RecurrenceFields } from "@/components/school/recurrence-fields";
import { Button } from "@/components/ui/button";
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
import type { Organization } from "@/types/database";

const needSchema = z.object({
  skill: z.string().min(1, "Skill is required"),
  title: z.string().optional(),
  message: z.string().optional(),
});

type NeedFormValues = z.infer<typeof needSchema>;

export function SchoolTeacherNeedForm({ org }: { org: Organization }) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [slotStart, setSlotStart] = useState("17:00");
  const [slotEnd, setSlotEnd] = useState("18:00");
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>("once");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [isPending, startTransition] = useTransition();

  const isApproved = org.approval_status === "approved";

  const form = useForm<NeedFormValues>({
    resolver: zodResolver(needSchema),
    defaultValues: { skill: "", title: "", message: "" },
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
      start: `${slotStart}:00`,
      end: `${slotEnd}:00`,
    }));
  };

  const onSubmit = (values: NeedFormValues) => {
    const weekDays = collectWeekDays();
    if (!weekDays) return;

    const formData = new FormData();
    formData.set("skill", values.skill);
    if (values.title) formData.set("title", values.title);
    if (values.message) formData.set("message", values.message);
    formData.set("week_days", JSON.stringify(weekDays));
    formData.set("recurrence_mode", recurrenceMode);
    if (recurrenceMode === "until_date") {
      formData.set("recurrence_until", recurrenceUntil);
    }

    startTransition(async () => {
      const result = await submitTeacherNeed(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Request sent to CultureBeats. We’ll match a teacher and get back to you.",
      );
      form.reset();
      setSelectedDays([]);
      setRecurrenceMode("once");
      setRecurrenceUntil("");
    });
  };

  const skillItems = ART_SKILLS.map((s) => ({ value: s, label: s }));

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto max-w-xl space-y-6"
    >
      <fieldset disabled={!isApproved || isPending} className="space-y-6">
        <div className="space-y-2">
          <Label>
            Activity <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.watch("skill") || undefined}
            onValueChange={(v) => form.setValue("skill", v ?? "")}
            items={skillItems}
          >
            <SelectTrigger className="w-full">
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
          {form.formState.errors.skill && (
            <p className="text-sm text-destructive">
              {form.formState.errors.skill.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="need_title">Class title (optional)</Label>
          <Input
            id="need_title"
            placeholder="Defaults to the activity name"
            {...form.register("title")}
          />
        </div>

        <div className="space-y-2">
          <Label>Days</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  selectedDays.includes(day.value)
                    ? "bg-foreground text-background"
                    : "bg-muted/60 hover:bg-muted",
                )}
              >
                {day.label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slot_start">Start time</Label>
            <Input
              id="slot_start"
              type="time"
              value={slotStart}
              onChange={(e) => setSlotStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot_end">End time</Label>
            <Input
              id="slot_end"
              type="time"
              value={slotEnd}
              onChange={(e) => setSlotEnd(e.target.value)}
            />
          </div>
        </div>

        <RecurrenceFields
          mode={recurrenceMode}
          until={recurrenceUntil}
          onModeChange={setRecurrenceMode}
          onUntilChange={setRecurrenceUntil}
        />

        {selectedDays.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedDays
              .map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label)
              .join(", ")}{" "}
            · {formatTime(slotStart)}–{formatTime(slotEnd)}
            {recurrenceMode !== "once"
              ? ` · ${formatRecurrenceLabel({ mode: recurrenceMode, until: recurrenceUntil || null })}`
              : null}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="need_message">Note for CultureBeats (optional)</Label>
          <Textarea
            id="need_message"
            rows={3}
            placeholder="Anything helpful — grade, level, language…"
            {...form.register("message")}
          />
        </div>

        <Button type="submit" disabled={!isApproved || isPending}>
          {isPending ? "Sending…" : "Send request"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Schools don’t pick teachers directly. CultureBeats matches someone for
          your slot and sends them a request to accept.
        </p>
      </fieldset>
    </form>
  );
}
