import { redirect } from "next/navigation";

import { TeacherOnboardingForm } from "@/components/teacher/teacher-onboarding-form";
import { TeacherDiscoverabilitySetting } from "@/components/teacher/teacher-discoverability-setting";
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
          Update your skills, bio, credentials, and academy visibility.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Your teacher ID</CardTitle>
          <CardDescription>
            Share this 6-digit ID with academies or CultureBeats admins. It is
            assigned as soon as you register.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-3xl tracking-widest">
            {profile.teacher?.lookup_code ?? "------"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            Academy discovery
          </CardTitle>
          <CardDescription>
            Choose whether academies can find you by email or teacher ID and
            invite you to join.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeacherDiscoverabilitySetting
            initialDiscoverable={
              profile.teacher?.discoverable_by_academies ?? true
            }
          />
        </CardContent>
      </Card>

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
