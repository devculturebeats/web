"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { RecurrenceMode } from "@/lib/recurrence";

const OPTIONS: { value: RecurrenceMode; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "ongoing", label: "Ongoing" },
  { value: "until_date", label: "Until date" },
];

function helperText(mode: RecurrenceMode): string {
  if (mode === "until_date") return "Meets every selected week through the end date.";
  if (mode === "ongoing") return "Meets every selected week with no end date.";
  return "One meeting on each selected day.";
}

export function RecurrenceFields({
  mode,
  until,
  onModeChange,
  onUntilChange,
  disabled,
  idPrefix = "recurrence",
}: {
  mode: RecurrenceMode;
  until: string;
  onModeChange: (mode: RecurrenceMode) => void;
  onUntilChange: (until: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>Repeat</Label>
      <div className="flex flex-wrap items-center gap-2">
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onModeChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                disabled && "opacity-60",
              )}
            >
              {option.label}
            </button>
          );
        })}

        {mode === "until_date" && (
          <Input
            id={`${idPrefix}-until`}
            type="date"
            value={until}
            disabled={disabled}
            onChange={(e) => onUntilChange(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            aria-label="End date"
            className="h-9 w-auto min-w-[10.5rem]"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{helperText(mode)}</p>
    </div>
  );
}
