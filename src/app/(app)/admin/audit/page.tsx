import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuditLogList } from "@/components/admin/audit-log-list";
import type { AuditLogWithActor } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "superadmin") redirect("/dashboard");

  const { action: actionFilter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select(
      "*, actor:profiles!audit_logs_actor_id_fkey(full_name, email), organization:organizations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (actionFilter?.trim()) {
    query = query.ilike("action", `%${actionFilter.trim()}%`);
  }

  const { data: logs } = await query;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to admin
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
          Audit log
        </h1>
        <p className="mt-1 text-muted-foreground">
          Recent platform activity across all organizations.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AuditLogList
          logs={(logs ?? []) as AuditLogWithActor[]}
          showActionFilter
          showOrganization
          emptyMessage="No audit entries found."
        />
      </Suspense>
    </div>
  );
}
