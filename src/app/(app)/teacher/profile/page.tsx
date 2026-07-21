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

export default async function TeacherProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Teacher profile
        </h1>
        <p className="mt-1 text-muted-foreground">
          Update your skills, bio, and credentials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Profile details</CardTitle>
          <CardDescription>
            Keep your information current so schools can find the right match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeacherOnboardingForm profile={profile} mode="edit" />
        </CardContent>
      </Card>
    </div>
  );
}
