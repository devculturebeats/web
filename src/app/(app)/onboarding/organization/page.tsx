import { redirect } from "next/navigation";

import { OrgOnboardingForm } from "@/components/org/org-onboarding-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Set up your {orgLabel.toLowerCase()}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Register your organization to start managing batches, classes, and
          students on CultureBeats.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{orgLabel} details</CardTitle>
          <CardDescription>
            Fields marked with * are required. Your organization will be
            reviewed before full access is granted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgOnboardingForm profile={profile} orgLabel={orgLabel} />
        </CardContent>
      </Card>
    </div>
  );
}
