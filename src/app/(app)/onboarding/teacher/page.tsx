import { redirect } from "next/navigation";

import { TeacherOnboardingForm } from "@/components/teacher/teacher-onboarding-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/profiles";

export default async function TeacherOnboardingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Complete your teacher profile
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tell us about your skills and experience so schools can find you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Your details</CardTitle>
          <CardDescription>
            Fields marked with * are required to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeacherOnboardingForm profile={profile} mode="onboarding" />
        </CardContent>
      </Card>
    </div>
  );
}
