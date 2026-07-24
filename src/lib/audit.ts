import { formatDateTime } from "@/lib/dates";
import type { AuditLog, Json } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  "approval.profile": "Profile approval",
  "approval.organization": "Organization approval",
  "class.cancel": "Class cancelled",
  "class.sessions_created": "Sessions created",
  "class.teacher_replace": "Teacher replaced",
  "class.teacher_replace_request": "Replacement requested",
  "class.rematch_requested": "Rematch requested",
  "parent.link_request": "Parent link requested",
  "parent.link_accept": "Parent link accepted",
  "parent.school_attach": "Parent attached by school",
  "parent.school_invite": "Parent invited by school",
  "parent.provision": "Parent provisioned",
  "enrollment.create": "Student enrolled",
  "session.reschedule": "Session rescheduled",
  "session.cancel": "Session cancelled",
  "session.outcome": "Session outcome",
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
      const reason = m.reason ? String(m.reason) : null;
      if (typeof affected === "number") {
        const count =
          affected === 1 ? "1 session" : `${affected} sessions`;
        return reason ? `${count} · ${reason}` : count;
      }
      if (reason) return reason;
      return m.scope === "series" ? "Entire series" : null;
    }
    case "session.outcome": {
      const outcome = m.outcome ? String(m.outcome).replace(/_/g, " ") : null;
      const reason = m.reason ? String(m.reason) : null;
      if (outcome && reason) return `${outcome} · ${reason}`;
      return outcome ?? reason;
    }
    case "class.teacher_replace":
    case "class.teacher_replace_request": {
      const reason = m.reason ? String(m.reason) : null;
      if (m.direct === true) {
        return reason ? `Direct · ${reason}` : "Direct swap";
      }
      return reason;
    }
    case "class.rematch_requested":
      return m.reason
        ? String(m.reason)
        : m.title
          ? String(m.title)
          : null;
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
