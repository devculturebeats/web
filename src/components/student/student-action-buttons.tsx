"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  completeStudentOnboarding,
  enrollInClass,
  joinOrganization,
  leaveClass,
  markNotificationRead,
  respondToInstitutionInvite,
} from "@/app/(app)/student/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm() {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await completeStudentOnboarding(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">Complete your profile</CardTitle>
        <CardDescription>
          Add your name so teachers and schools can identify you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 ..."
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Save profile
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function JoinOrgButton({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleJoin = () => {
    startTransition(async () => {
      const result = await joinOrganization(orgId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Linked to institution");
    });
  };

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleJoin}>
      Join
    </Button>
  );
}

export function RespondInstitutionInviteButtons({
  requestId,
}: {
  requestId: string;
}) {
  const [isPending, startTransition] = useTransition();

  const respond = (accept: boolean) => {
    startTransition(async () => {
      const result = await respondToInstitutionInvite(requestId, accept);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(accept ? "You’re linked now" : "Invite declined");
    });
  };

  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" disabled={isPending} onClick={() => respond(true)}>
        Yes, accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => respond(false)}
      >
        No
      </Button>
    </div>
  );
}

export function EnrollButton({ classId }: { classId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleEnroll = () => {
    startTransition(async () => {
      const result = await enrollInClass(classId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Enrolled successfully");
    });
  };

  return (
    <Button size="sm" disabled={isPending} onClick={handleEnroll}>
      {isPending ? "Enrolling…" : "Enroll"}
    </Button>
  );
}

export function LeaveClassButton({ classId }: { classId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleLeave = () => {
    startTransition(async () => {
      const result = await leaveClass(classId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Left class");
    });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={handleLeave}
    >
      Leave
    </Button>
  );
}

export function MarkReadButton({ recipientId }: { recipientId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleMarkRead = () => {
    startTransition(async () => {
      const result = await markNotificationRead(recipientId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as read");
    });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={handleMarkRead}
    >
      Mark as read
    </Button>
  );
}

export function formatEnrollmentSource(source: string): string {
  if (source === "self") return "Joined yourself";
  if (source === "assigned" || source === "school") return "Via school";
  if (source === "academy") return "Via academy";
  return source;
}
