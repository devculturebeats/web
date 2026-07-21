import { formatDateTime } from "@/lib/dates";
import type { AuditLog, Json } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  "approval.profile": "Profile approval",
  "approval.organization": "Organization approval",
  "class.cancel": "Class cancelled",
  "class.sessions_created": "Sessions created",
  "enrollment.create": "Student enrolled",
  "session.reschedule": "Session rescheduled",
  "session.cancel": "Session cancelled",
};

export function formatAuditAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" · ");
}

export function formatAuditEntityType(entityType: string): string {
  return entityType.replace(/_/g, " ");
}

function metadataRecord(metadata: Json): Record<string, Json | undefined> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, Json | undefined>;
}

export function formatAuditDetails(
  action: string,
  metadata: Json,
): string | null {
  const m = metadataRecord(metadata);
  if (!m) return null;

  switch (action) {
    case "approval.profile": {
      const name = m.full_name ?? m.email;
      const status = m.to;
      if (name && status) return `${name} → ${status}`;
      if (status) return `Status → ${status}`;
      return null;
    }
    case "approval.organization": {
      const name = m.name;
      const status = m.to;
      if (name && status) return `${name} → ${status}`;
      return name ? String(name) : null;
    }
    case "class.cancel":
      return m.title ? String(m.title) : m.reason ? String(m.reason) : null;
    case "class.sessions_created": {
      const weeks = m.recurring_weeks;
      if (typeof weeks === "number" && weeks > 0) {
        return `${weeks + 1} sessions`;
      }
      if (typeof m.starts_at === "string") {
        return formatDateTime(m.starts_at);
      }
      return null;
    }
    case "enrollment.create":
      return m.source ? `via ${m.source}` : null;
    case "session.reschedule":
      if (m.scope === "series") return "Entire series";
      if (typeof m.starts_at === "string") {
        return formatDateTime(m.starts_at);
      }
      return null;
    case "session.cancel": {
      const affected = m.affected;
      if (typeof affected === "number") {
        return affected === 1 ? "1 session" : `${affected} sessions`;
      }
      return m.scope === "series" ? "Entire series" : null;
    }
    default:
      return null;
  }
}

export function formatAuditActor(
  actor: { full_name: string; email: string } | null,
): string {
  if (!actor) return "System";
  return actor.full_name?.trim() || actor.email;
}

export type AuditLogWithActor = AuditLog & {
  actor: { full_name: string; email: string } | null;
  organization?: { name: string } | null;
};
