"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  cancelTeacherInvite,
  discoverTeachersForAcademy,
  inviteTeacherToAcademy,
  removeAcademyTeacher,
} from "@/app/(app)/academy/actions";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DiscoverableTeacher } from "@/types/database";

const discoverSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Enter a teacher email or 6-digit teacher ID")
    .refine(
      (v) => /^[0-9]{6}$/.test(v) || v.includes("@"),
      "Enter the full email or exact 6-digit teacher ID",
    ),
});

type DiscoverFormValues = z.infer<typeof discoverSchema>;

export type LinkedAcademyTeacher = {
  id: string;
  teacher_id: string;
  teacher_profile_id: string;
  created_at: string;
  teacher: {
    full_name: string;
    email: string;
    phone: string | null;
    lookup_code: string;
    primary_skill: string | null;
    secondary_skills: string[] | null;
  } | null;
};

export type PendingTeacherInvite = {
  id: string;
  teacher_email: string;
  teacher_profile_id: string | null;
  created_at: string;
  message?: string | null;
  teacher: {
    full_name: string;
    email: string;
  } | null;
};

function skillsLabel(teacher: {
  primary_skill: string | null;
  secondary_skills: string[] | null;
}): string {
  return [
    teacher.primary_skill,
    ...(teacher.secondary_skills ?? []),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AcademyTeachersPanel({
  teachers,
  pendingInvites = [],
  disabled,
}: {
  teachers: LinkedAcademyTeacher[];
  pendingInvites?: PendingTeacherInvite[];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discoveries, setDiscoveries] = useState<DiscoverableTeacher[] | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DiscoverFormValues>({
    resolver: zodResolver(discoverSchema),
    defaultValues: { query: "" },
  });

  const onDiscover = (values: DiscoverFormValues) => {
    const formData = new FormData();
    formData.set("query", values.query.trim());

    startTransition(async () => {
      const result = await discoverTeachersForAcademy(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDiscoveries(result.discoveries ?? []);
      if ((result.discoveries ?? []).length === 0) {
        toast.info(
          "No discoverable teacher matched. Use the exact email or 6-digit teacher ID, and they must allow academy discovery.",
        );
      }
    });
  };

  const onInvite = (teacher: DiscoverableTeacher) => {
    const formData = new FormData();
    formData.set("teacher_id", teacher.teacher_id);
    setBusyId(teacher.teacher_id);
    startTransition(async () => {
      const result = await inviteTeacherToAcademy(formData);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite sent. Waiting for the teacher to accept.");
      setDiscoveries((prev) =>
        (prev ?? []).map((row) =>
          row.teacher_id === teacher.teacher_id
            ? { ...row, invite_pending: true }
            : row,
        ),
      );
    });
  };

  const handleCancel = (requestId: string) => {
    setBusyId(requestId);
    startTransition(async () => {
      const result = await cancelTeacherInvite(requestId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite cancelled.");
    });
  };

  const handleRemove = (teacherId: string, name: string) => {
    if (
      !window.confirm(
        `Remove ${name} from this academy? They will no longer be available for class assignment.`,
      )
    ) {
      return;
    }
    setBusyId(teacherId);
    startTransition(async () => {
      const result = await removeAcademyTeacher(teacherId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Teacher removed from your academy.");
    });
  };

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Discover teachers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Look up a teacher by their full email or exact 6-digit teacher ID,
            then send a request to join your institution.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onDiscover)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="discover-query">Email or teacher ID</Label>
            <Input
              id="discover-query"
              placeholder="teacher@example.com or 482917"
              disabled={disabled || isPending}
              {...register("query")}
            />
            {errors.query ? (
              <p className="text-sm text-destructive">{errors.query.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={disabled || isPending}>
            {isPending ? "Searching…" : "Search"}
          </Button>
        </form>

        {discoveries ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Results ({discoveries.length})
            </h3>
            {discoveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No discoverable teachers matched.
              </p>
            ) : (
              <PaginatedList
                items={discoveries}
                pageSize={10}
                label="teachers"
              >
                {(pageItems) => (
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                    {pageItems.map((teacher) => (
                      <li
                        key={teacher.teacher_id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{teacher.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            ID {teacher.lookup_code}
                            {skillsLabel(teacher)
                              ? ` · ${skillsLabel(teacher)}`
                              : ""}
                            {teacher.city ? ` · ${teacher.city}` : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {teacher.phone ? `${teacher.phone} · ` : ""}
                            {teacher.email}
                          </p>
                        </div>
                        {teacher.already_linked ? (
                          <span className="text-sm text-muted-foreground">
                            Already linked
                          </span>
                        ) : teacher.invite_pending ? (
                          <span className="text-sm text-muted-foreground">
                            Invite pending
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            disabled={disabled || busyId === teacher.teacher_id}
                            onClick={() => onInvite(teacher)}
                          >
                            Request to join
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </PaginatedList>
            )}
          </div>
        ) : null}
      </section>

      {pendingInvites.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Pending invites</h3>
          <PaginatedList items={pendingInvites} pageSize={10} label="invites">
            {(pageItems) => (
              <ul className="divide-y divide-border/60 border-y border-border/60">
                {pageItems.map((invite) => (
                  <li key={invite.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {invite.teacher?.full_name || invite.teacher_email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {invite.teacher_email}
                        </p>
                        {invite.message ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Note:{" "}
                            </span>
                            {invite.message}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || busyId === invite.id}
                        onClick={() => handleCancel(invite.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PaginatedList>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">
            Linked teachers ({teachers.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Only these teachers can be assigned to classes from Assign
            teachers.
          </p>
        </div>
        {teachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teachers have joined yet. Discover and invite them above.
          </p>
        ) : (
          <PaginatedList items={teachers} pageSize={15} label="teachers">
            {(pageItems) => (
              <ul className="divide-y divide-border/60 border-y border-border/60">
                {pageItems.map((link) => {
                  const name = link.teacher?.full_name || "Teacher";
                  return (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">
                          ID {link.teacher?.lookup_code}
                          {link.teacher?.email ? ` · ${link.teacher.email}` : ""}
                          {link.teacher?.phone
                            ? ` · ${link.teacher.phone}`
                            : ""}
                        </p>
                        {link.teacher ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {skillsLabel(link.teacher) || null}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || busyId === link.teacher_id}
                        onClick={() => handleRemove(link.teacher_id, name)}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PaginatedList>
        )}
      </section>
    </div>
  );
}
