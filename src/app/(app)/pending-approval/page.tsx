import { redirect } from "next/navigation";

import { getCurrentOrganization } from "@/lib/orgs";
import { getCurrentProfile } from "@/lib/profiles";

export default async function PendingApprovalPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (
    profile.role !== "school_admin" &&
    profile.role !== "academy_admin"
  ) {
    redirect("/dashboard");
  }

  const org = await getCurrentOrganization();
  if (!org) redirect("/onboarding/organization");

  if (org.approval_status === "approved") {
    redirect(org.type === "academy" ? "/academy" : "/school");
  }

  const kind = org.type === "academy" ? "academy" : "school";

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {org.approval_status === "rejected"
          ? "Registration not approved"
          : "Waiting for verification"}
      </h1>
      <p className="text-muted-foreground">
        {org.approval_status === "rejected"
          ? `Your ${kind} “${org.name}” was not approved. Contact CultureBeats support if you think this is a mistake.`
          : `Thanks for registering ${org.name}. We’re reviewing your ${kind}. You’ll get full access once verified — for now only My account is available.`}
      </p>
    </div>
  );
}
