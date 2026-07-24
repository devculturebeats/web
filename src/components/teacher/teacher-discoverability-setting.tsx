"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAcademyDiscoverability } from "@/app/(app)/teacher/settings/actions";
import { Label } from "@/components/ui/label";

export function TeacherDiscoverabilitySetting({
  initialDiscoverable,
}: {
  initialDiscoverable: boolean;
}) {
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [isPending, startTransition] = useTransition();

  const onToggle = (next: boolean) => {
    const previous = discoverable;
    setDiscoverable(next);
    startTransition(async () => {
      const result = await updateAcademyDiscoverability(next);
      if (result.error) {
        setDiscoverable(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? "Academies can find your profile."
          : "Your profile is hidden from academy search.",
      );
    });
  };

  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={discoverable}
        disabled={isPending}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span>
        <Label className="font-medium">
          Allow academies to find my profile
        </Label>
        <span className="mt-1 block text-sm text-muted-foreground">
          When on, academies can look you up by your full email or 6-digit
          teacher ID and send a join request. When off, you stay hidden from
          that search — existing links and pending invites are unchanged.
        </span>
      </span>
    </label>
  );
}
