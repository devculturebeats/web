"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { respondToAcademyInvite } from "@/app/(app)/teacher/requests/actions";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";

export type AcademyInviteWithOrg = {
  id: string;
  teacher_email: string;
  created_at: string;
  message?: string | null;
  organizations: { name: string; city: string | null } | null;
};

export function AcademyInviteList({
  pending,
}: {
  pending: AcademyInviteWithOrg[];
}) {
  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold">Academy invites</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join an academy to appear in their teacher search and take their
          classes.
        </p>
      </div>
      <PaginatedList items={pending} pageSize={10} label="invites">
        {(pageItems) => (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {pageItems.map((invite) => (
              <AcademyInviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        )}
      </PaginatedList>
    </div>
  );
}

function AcademyInviteRow({ invite }: { invite: AcademyInviteWithOrg }) {
  const [isPending, startTransition] = useTransition();
  const orgName = invite.organizations?.name ?? "Academy";
  const city = invite.organizations?.city;

  const handleRespond = (accept: boolean) => {
    startTransition(async () => {
      const result = await respondToAcademyInvite(invite.id, accept);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(accept ? "You joined the academy." : "Invite declined.");
    });
  };

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{orgName}</p>
          <p className="text-sm text-muted-foreground">
            {city ? `${city} · ` : ""}
            Invite to {invite.teacher_email}
          </p>
          {invite.message ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Note: </span>
              {invite.message}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => handleRespond(true)}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handleRespond(false)}
          >
            Decline
          </Button>
        </div>
      </div>
    </li>
  );
}
