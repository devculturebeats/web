"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAcademyDiscoverability } from "@/app/(app)/teacher/settings/actions";
import { Button } from "@/components/ui/button";

export function TeacherDiscoverabilitySetting({
  initialDiscoverable,
}: {
  initialDiscoverable: boolean;
}) {
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    const next = !discoverable;
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
          ? "Academy discovery is now enabled."
          : "Academy discovery is now disabled.",
      );
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When enabled, academies can look you up by your full email or 6-digit
        teacher ID and send a join request. When disabled, you stay hidden from
        that search — existing links and pending invites are unchanged.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={discoverable ? "outline" : "default"}
          disabled={isPending}
          onClick={onToggle}
        >
          {isPending
            ? "Saving…"
            : discoverable
              ? "Disable discovery"
              : "Enable discovery"}
        </Button>
        <p className="text-sm font-medium">
          Currently {discoverable ? "enabled" : "disabled"}
        </p>
      </div>
    </div>
  );
}
