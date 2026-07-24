"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  requestLinkToStudent,
  respondToParentLinkRequest,
  setSelectedChild,
} from "@/app/(app)/parent/actions";
import type {
  LinkedChild,
  ParentLinkInvite,
} from "@/lib/parent/types";
import type { EnrolledClass, UpcomingSession } from "@/components/student/types";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates";

const linkSchema = z
  .object({
    email: z.string().optional(),
    lookup_code: z.string().optional(),
    message: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.email?.trim() || v.lookup_code?.trim()),
    { message: "Enter an email or 6-digit student ID", path: ["email"] },
  );

type LinkFormValues = z.infer<typeof linkSchema>;

export function ParentStudentSwitcher({
  childrenList,
  selectedChildId,
}: {
  childrenList: LinkedChild[];
  selectedChildId: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  if (childrenList.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="parent-child-switch" className="sr-only">
        Viewing student
      </Label>
      <Select
        value={selectedChildId ?? undefined}
        onValueChange={(value) => {
          if (!value) return;
          startTransition(async () => {
            const result = await setSelectedChild(value);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Switched student");
          });
        }}
      >
        <SelectTrigger
          id="parent-child-switch"
          className="w-[11rem]"
          disabled={isPending}
        >
          <SelectValue placeholder="Student" />
        </SelectTrigger>
        <SelectContent>
          {childrenList.map((child) => (
            <SelectItem key={child.studentProfileId} value={child.studentProfileId}>
              {child.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ParentHome({
  childrenList,
  selectedChildId,
  pendingIncoming,
  pendingOutgoing,
  upcomingSessions,
  myClasses,
}: {
  childrenList: LinkedChild[];
  selectedChildId: string | null;
  pendingIncoming: ParentLinkInvite[];
  pendingOutgoing: ParentLinkInvite[];
  upcomingSessions: UpcomingSession[];
  myClasses: EnrolledClass[];
}) {
  const [isPending, startTransition] = useTransition();
  const selected = childrenList.find(
    (c) => c.studentProfileId === selectedChildId,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: { email: "", lookup_code: "", message: "" },
  });

  const onLink = (values: LinkFormValues) => {
    const formData = new FormData();
    if (values.email?.trim()) formData.set("email", values.email.trim());
    if (values.lookup_code?.trim()) {
      formData.set("lookup_code", values.lookup_code.trim());
    }
    if (values.message?.trim()) formData.set("message", values.message.trim());

    startTransition(async () => {
      const result = await requestLinkToStudent(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Link request sent — waiting for the student to accept.");
      reset();
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {selected
              ? `${selected.fullName.split(" ")[0]}’s schedule`
              : "Parent home"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {childrenList.length === 0
              ? "Link a student to see their classes."
              : "Read-only view of your linked student’s classes."}
          </p>
        </div>
        <ParentStudentSwitcher
          childrenList={childrenList}
          selectedChildId={selectedChildId}
        />
      </div>

      {pendingIncoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Invites waiting for you</h2>
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
                        toast.success("Linked");
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
        </section>
      )}

      {pendingOutgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Waiting on student</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {pendingOutgoing.map((invite) => (
              <li key={invite.id}>
                {invite.counterpartName}
                {invite.counterpartEmail ? ` (${invite.counterpartEmail})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Link a student
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use their exact email or 6-digit student ID. They’ll accept before
            you’re linked.
          </p>
        </div>
        <form onSubmit={handleSubmit(onLink)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent-link-email">Student email</Label>
              <Input
                id="parent-link-email"
                type="email"
                placeholder="student@example.com"
                {...register("email")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-link-code">Student ID</Label>
              <Input
                id="parent-link-code"
                inputMode="numeric"
                placeholder="6 digits"
                maxLength={6}
                {...register("lookup_code")}
              />
            </div>
          </div>
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="parent-link-message">Note (optional)</Label>
            <Textarea
              id="parent-link-message"
              rows={2}
              placeholder="Hi, I’m your parent…"
              {...register("message")}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Send link request
          </Button>
        </form>
      </section>

      {selected && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Upcoming</h2>
              <Link
                href="/parent/courses"
                className="text-sm text-primary hover:underline"
              >
                All classes
              </Link>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming sessions.
              </p>
            ) : (
              <PaginatedList
                items={upcomingSessions}
                pageSize={10}
                label="sessions"
              >
                {(pageItems) => (
                  <ul className="space-y-2">
                    {pageItems.map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {session.classTitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(session.startsAt)}
                            {session.orgName ? ` · ${session.orgName}` : ""}
                          </p>
                        </div>
                        <LifecycleBadge status={session.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </PaginatedList>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Classes</h2>
            {myClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No enrolled classes yet.
              </p>
            ) : (
              <PaginatedList items={myClasses} pageSize={10} label="classes">
                {(pageItems) => (
                  <ul className="divide-y rounded-lg border">
                    {pageItems.map((cls) => (
                      <li key={cls.id} className="px-3 py-3 text-sm">
                        <Link
                          href={`/classes/${cls.id}`}
                          className="font-medium hover:underline"
                        >
                          {cls.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[cls.orgName, cls.teacherName, cls.status]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </PaginatedList>
            )}
          </section>
        </>
      )}
    </div>
  );
}
