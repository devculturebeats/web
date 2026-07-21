export type WeekDaySlot = {
  day: number;
  start: string;
  end: string;
};

function normalizeTime(time: string): string {
  if (time.length === 5) return `${time}:00`;
  return time;
}

/** Parse JSON week_days from forms: [{ day, start, end }, ...] */
export function parseWeekDays(raw: string | null): WeekDaySlot[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WeekDaySlot[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const slots = parsed
      .filter(
        (slot) =>
          Number.isInteger(slot.day) &&
          slot.day >= 0 &&
          slot.day <= 6 &&
          typeof slot.start === "string" &&
          typeof slot.end === "string" &&
          slot.start.length >= 5 &&
          slot.end.length >= 5 &&
          slot.start.slice(0, 5) < slot.end.slice(0, 5),
      )
      .map((slot) => ({
        day: slot.day,
        start: normalizeTime(slot.start.slice(0, 5)),
        end: normalizeTime(slot.end.slice(0, 5)),
      }));

    if (slots.length === 0) return null;

    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        if (slots[i].day !== slots[j].day) continue;
        if (
          slots[i].start < slots[j].end &&
          slots[j].start < slots[i].end
        ) {
          return null;
        }
      }
    }

    return slots;
  } catch {
    return null;
  }
}

export function weekSlotsToJson(slots: WeekDaySlot[]): {
  day: number;
  start: string;
  end: string;
}[] {
  return slots.map((slot) => ({
    day: slot.day,
    start: slot.start,
    end: slot.end,
  }));
}

/** Resolve weekly slots from a class row's proposed_* fields. */
export function slotsFromProposed(input: {
  proposed_slots?: unknown;
  proposed_day_of_week?: number | null;
  proposed_start_time?: string | null;
  proposed_end_time?: string | null;
}): WeekDaySlot[] | null {
  if (Array.isArray(input.proposed_slots) && input.proposed_slots.length > 0) {
    return parseWeekDays(JSON.stringify(input.proposed_slots));
  }

  if (
    input.proposed_day_of_week == null ||
    !input.proposed_start_time ||
    !input.proposed_end_time
  ) {
    return null;
  }

  return [
    {
      day: input.proposed_day_of_week,
      start: normalizeTime(input.proposed_start_time.slice(0, 5)),
      end: normalizeTime(input.proposed_end_time.slice(0, 5)),
    },
  ];
}
