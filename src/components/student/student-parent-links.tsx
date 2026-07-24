"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  requestLinkToParent,
  respondToParentLinkRequest,
} from "@/app/(app)/parent/actions";
import type { ParentLinkInvite } from "@/lib/parent/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter a valid parent email"),
  message: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function StudentParentLinks({
  lookupCode,
  pendingIncoming,
  pendingOutgoing,
}: {
  lookupCode: string | null;
  pendingIncoming: ParentLinkInvite[];
  pendingOutgoing: ParentLinkInvite[];
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", message: "" },
  });

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 className="font-heading text-base font-semibold">Parents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite a parent by email, or share your student ID so they can request
          a link.
        </p>
        {lookupCode && (
          <p className="mt-2 text-sm">
            Your student ID:{" "}
            <span className="font-mono font-medium">{lookupCode}</span>
          </p>
        )}
      </div>

      {pendingIncoming.length > 0 && (
        <ul className="space-y-2">
          {pendingIncoming.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{invite.counterpartName}</p>
                <p className="text-muted-foreground">
                  {invite.counterpartEmail}
                  {invite.message ? ` · ${invite.message}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await respondToParentLinkRequest(
                        invite.id,
                        true,
                      );
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Parent linked");
                    });
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await respondToParentLinkRequest(
                        invite.id,
                        false,
                      );
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Declined");
                    });
                  }}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingOutgoing.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Waiting on:{" "}
          {pendingOutgoing
            .map((i) => i.counterpartEmail || i.counterpartName)
            .join(", ")}
        </p>
      )}

      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => {
          const formData = new FormData();
          formData.set("email", values.email);
          if (values.message?.trim()) {
            formData.set("message", values.message.trim());
          }
          startTransition(async () => {
            const result = await requestLinkToParent(formData);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Invite sent to parent");
            reset();
          });
        })}
      >
        <div className="space-y-2">
          <Label htmlFor="student-parent-email">Parent email</Label>
          <Input
            id="student-parent-email"
            type="email"
            placeholder="parent@example.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          Invite parent
        </Button>
      </form>
    </section>
  );
}
