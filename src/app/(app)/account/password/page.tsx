import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getRoleLabel } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/profiles";
import { isSyntheticStudentEmail } from "@/lib/student-credentials";

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const showUsername = Boolean(profile.username);
  const showEmail =
    Boolean(profile.email) && !isSyntheticStudentEmail(profile.email);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            My account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your profile details.
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">Name</p>
          <p className="font-medium">{profile.full_name || "—"}</p>
        </div>
        {showUsername ? (
          <div>
            <p className="text-xs text-muted-foreground">Username</p>
            <p className="font-medium font-mono">{profile.username}</p>
          </div>
        ) : null}
        {showEmail ? (
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{profile.email}</p>
          </div>
        ) : null}
        {!showUsername && !showEmail ? (
          <div>
            <p className="text-xs text-muted-foreground">Login</p>
            <p className="font-medium text-muted-foreground">Not set yet</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs text-muted-foreground">Role</p>
          <p className="font-medium">{getRoleLabel(profile.role)}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Change password
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your current password, then choose a new one.
          </p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
