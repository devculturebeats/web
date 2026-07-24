import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/admin-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "superadmin") redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: pendingTeachers }, { data: pendingOrgs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, approval_status, created_at, teachers(primary_skill, city, lookup_code)")
      .eq("role", "teacher")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("organizations")
      .select("id, name, type, city, lookup_code, approval_status, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Approvals
          </h1>
          <p className="mt-1 text-muted-foreground">
            Clear the queue — teachers and organizations waiting to join.
          </p>
        </div>
        <Link
          href="/admin/requests"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          School requests
        </Link>
        <Link
          href="/admin/audit"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          View audit log
        </Link>
      </div>

      <AdminPanel
        pendingTeachers={pendingTeachers ?? []}
        pendingOrgs={pendingOrgs ?? []}
      />
    </div>
  );
}
