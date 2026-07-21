export type RecurrenceMode = "once" | "until_date" | "ongoing";

export type RecurrenceValue = {
  mode: RecurrenceMode;
  until: string | null; // YYYY-MM-DD
};

export function parseRecurrenceFromForm(formData: FormData): {
  value: RecurrenceValue;
  error?: string;
} {
  const rawMode = (formData.get("recurrence_mode") as string | null)?.trim();
  const mode =
    rawMode === "until_date" || rawMode === "ongoing" || rawMode === "once"
      ? rawMode
      : "once";
  const untilRaw = (formData.get("recurrence_until") as string | null)?.trim();
  const until = untilRaw || null;

  if (mode === "until_date") {
    if (!until) {
      return {
        value: { mode, until: null },
        error: "Pick an end date for weekly classes.",
      };
    }
    const parsed = new Date(`${until}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return {
        value: { mode, until: null },
        error: "End date is invalid.",
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) {
      return {
        value: { mode, until },
        error: "End date must be today or later.",
      };
    }
  }

  return {
    value: {
      mode,
      until: mode === "until_date" ? until : null,
    },
  };
}

export function recurrenceDbFields(value: RecurrenceValue) {
  return {
    recurrence_mode: value.mode,
    recurrence_until: value.mode === "until_date" ? value.until : null,
  };
}

export function formatRecurrenceLabel(value: {
  mode: RecurrenceMode | string | null | undefined;
  until?: string | null;
}): string {
  const mode = value.mode ?? "once";
  if (mode === "ongoing") return "Every week · ongoing";
  if (mode === "until_date" && value.until) {
    const d = new Date(`${value.until}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return `Every week until ${d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`;
    }
    return `Every week until ${value.until}`;
  }
  if (mode === "until_date") return "Every week until a set date";
  return "This week only";
}
