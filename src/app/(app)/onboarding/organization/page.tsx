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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Set up your institution
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose school or academy, then tell us who is in charge and how to
          reach you. We review new institutions before full access is granted.
        </p>
      </div>

      <OrgOnboardingForm profile={profile} />
    </div>
  );
}
