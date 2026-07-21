import { redirect } from "next/navigation";

import { OrgOnboardingForm } from "@/components/org/org-onboarding-form";
import { getCurrentProfile } from "@/lib/profiles";
import { orgAdminNeedsOnboarding, orgTypeForRole } from "@/lib/orgs";

export default async function OrganizationOnboardingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  const orgType = orgTypeForRole(profile.role);
  if (!orgType) redirect("/dashboard");

  const needsOnboarding = await orgAdminNeedsOnboarding(profile.id);
  if (!needsOnboarding) {
    redirect(orgType === "school" ? "/school" : "/academy");
  }

  const orgLabel = orgType === "school" ? "School" : "Academy";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Set up your {orgLabel.toLowerCase()}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tell us about the institution, who is in charge, and how to reach you.
          We review new organizations before full access is granted.
        </p>
      </div>

      <OrgOnboardingForm profile={profile} orgLabel={orgLabel} />
    </div>
  );
}
