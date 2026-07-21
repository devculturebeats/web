import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/dates";

export type SessionLike = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  series_id?: string | null;
};

export type ClassSlotOption = {
  key: string;
  dayLabel: string;
  timeLabel: string;
  nextStartsAt: string;
  meetingCount: number;
  sessionIds: string[];
};

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function slotKeyFromStart(iso: string): {
  key: string;
  dayLabel: string;
  timeStart: string;
} {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(date);
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = dowMap[weekday] ?? date.getDay();
  const dayLabel =
    DAYS_OF_WEEK.find((day) => day.value === dow)?.label ?? weekday;

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = partValue(timeParts, "hour");
  const minute = partValue(timeParts, "minute");
  const timeStart = `${hour}:${minute}`;

  return {
    key: `${dow}-${timeStart}`,
    dayLabel,
    timeStart,
  };
}

function endTimeLabel(iso: string): string {
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = partValue(timeParts, "hour");
  const minute = partValue(timeParts, "minute");
  return `${hour}:${minute}`;
}

/** Group scheduled sessions into weekly slots (day + start time). */
export function groupSessionsIntoSlots(
  sessions: SessionLike[],
): ClassSlotOption[] {
  const now = Date.now();
  const map = new Map<
    string,
    {
      dayLabel: string;
      timeStart: string;
      timeEnd: string;
      sessionIds: string[];
      nextStartsAt: string | null;
    }
  >();

  for (const session of sessions) {
    if (session.status !== "scheduled" && session.status !== "postponed") {
      continue;
    }
    const { key, dayLabel, timeStart } = slotKeyFromStart(session.starts_at);
    const timeEnd = endTimeLabel(session.ends_at);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        dayLabel,
        timeStart,
        timeEnd,
        sessionIds: [session.id],
        nextStartsAt:
          new Date(session.starts_at).getTime() >= now
            ? session.starts_at
            : null,
      });
    } else {
      existing.sessionIds.push(session.id);
      if (
        new Date(session.starts_at).getTime() >= now &&
        (!existing.nextStartsAt ||
          session.starts_at < existing.nextStartsAt)
      ) {
        existing.nextStartsAt = session.starts_at;
      }
    }
  }

  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      dayLabel: value.dayLabel,
      timeLabel: `${formatTime(value.timeStart)} – ${formatTime(value.timeEnd)}`,
      nextStartsAt: value.nextStartsAt ?? "",
      meetingCount: value.sessionIds.length,
      sessionIds: value.sessionIds,
    }))
    .filter((slot) => slot.nextStartsAt !== "" || slot.meetingCount > 0)
    .sort((a, b) => {
      if (a.nextStartsAt && b.nextStartsAt) {
        return a.nextStartsAt.localeCompare(b.nextStartsAt);
      }
      return a.key.localeCompare(b.key);
    });
}

export function slotOptionSubtitle(slot: ClassSlotOption): string {
  const next = slot.nextStartsAt
    ? `Next ${formatDate(slot.nextStartsAt)}`
    : "No upcoming meetings";
  return `${next} · ${slot.meetingCount} meeting${slot.meetingCount === 1 ? "" : "s"}`;
}
