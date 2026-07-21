"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { StudentBulkImport } from "@/components/org/student-bulk-import";
import { issueStudentLogin } from "@/lib/org-student-roster";
import { linkStudent } from "@/lib/org-actions";
import {
  formatStudentContactLine,
  isSyntheticStudentEmail,
} from "@/lib/student-credentials";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Batch } from "@/types/database";

const linkSchema = z.object({
  email: z.string().email("Enter a valid student email"),
  batch_id: z.string().optional(),
});

type LinkFormValues = z.infer<typeof linkSchema>;

export type LinkedStudent = {
  id: string;
  student_profile_id: string;
  batch_id: string | null;
  created_at: string;
  student: {
    full_name: string;
    email: string;
    username: string | null;
  } | null;
  batch: { name: string } | null;
};

export type PendingStudentInvite = {
  id: string;
  student_profile_id: string | null;
  student_email: string;
  batch_id: string | null;
  created_at: string;
  student: {
    full_name: string;
    email: string;
  } | null;
  batch: { name: string } | null;
};

export function StudentsPanel({
  students,
  pendingInvites = [],
  batches,
  disabled,
}: {
  students: LinkedStudent[];
  pendingInvites?: PendingStudentInvite[];
  batches: Batch[];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [loginBusyId, setLoginBusyId] = useState<string | null>(null);
  const [issuedLogin, setIssuedLogin] = useState<{
    full_name: string;
    username: string;
    password: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: { email: "", batch_id: "" },
  });

  const batchId = watch("batch_id");
  const batchSelectItems = [
    { value: "none", label: "No batch" },
    ...batches.map((batch) => ({ value: batch.id, label: batch.name })),
  ];

  const onSubmit = (values: LinkFormValues) => {
    const formData = new FormData();
    formData.set("email", values.email);
    if (values.batch_id) formData.set("batch_id", values.batch_id);

    startTransition(async () => {
      const result = await linkStudent(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite sent. Waiting for the student to accept.");
      reset();
    });
  };

  const onIssueLogin = (studentProfileId: string) => {
    setLoginBusyId(studentProfileId);
    startTransition(async () => {
      const result = await issueStudentLogin(studentProfileId);
      setLoginBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.username || !result.password) {
        toast.error("Could not create login.");
        return;
      }
      setIssuedLogin({
        full_name: result.full_name || "Student",
        username: result.username,
        password: result.password,
      });
      toast.success("Login created — copy and share it now.");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Invite by email, or import a roster spreadsheet.
        </p>
        <StudentBulkImport disabled={disabled} />
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <fieldset disabled={disabled || isPending} className="space-y-4">
            <div>
              <h3 className="font-heading text-base font-semibold">
                Invite student
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                They can accept after signing up with this email — even if they
                don’t have an account yet.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="student_email">
                Student email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="student_email"
                type="email"
                placeholder="student@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            {batches.length > 0 && (
              <div className="space-y-2">
                <Label>Batch (optional)</Label>
                <Select
                  value={batchId || "none"}
                  onValueChange={(v) =>
                    setValue("batch_id", v === "none" || v == null ? "" : v)
                  }
                  items={batchSelectItems}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batchSelectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" size="sm" disabled={disabled || isPending}>
              {isPending ? "Sending…" : "Send invite"}
            </Button>
          </fieldset>
        </form>
      </section>

      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Waiting for acceptance
          </h3>
          <ul className="divide-y rounded-lg border">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="px-4 py-3">
                <p className="font-medium">
                  {invite.student?.full_name || "Pending signup"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {invite.student_email || invite.student?.email}
                </p>
                {!invite.student_profile_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Waiting for them to create an account and accept
                  </p>
                )}
                {invite.batch && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Batch: {invite.batch.name}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Linked students
        </h3>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked students yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {students.map((link) => {
              const hasUsername = Boolean(link.student?.username);
              const needsUsernameLogin =
                !hasUsername &&
                isSyntheticStudentEmail(link.student?.email);
              // Real email already is a login — only offer username create for
              // roster kids without email. Reset stays available once issued.
              const showLoginAction = needsUsernameLogin || hasUsername;

              return (
                <li
                  key={link.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {link.student?.full_name || "Unknown student"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatStudentContactLine({
                        email: link.student?.email,
                        username: link.student?.username,
                      })}
                    </p>
                    {link.batch && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Batch: {link.batch.name}
                      </p>
                    )}
                  </div>
                  {!disabled && showLoginAction && (
                    <Button
                      type="button"
                      size="sm"
                      variant={hasUsername ? "outline" : "default"}
                      disabled={loginBusyId === link.student_profile_id}
                      onClick={() => onIssueLogin(link.student_profile_id)}
                    >
                      {loginBusyId === link.student_profile_id
                        ? "Working…"
                        : hasUsername
                          ? "Reset password"
                          : "Create login"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(issuedLogin)}
        onOpenChange={(open) => {
          if (!open) setIssuedLogin(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share this login</DialogTitle>
            <DialogDescription>
              Copy username and password for{" "}
              {issuedLogin?.full_name ?? "the student"}. The password is only
              shown once.
            </DialogDescription>
          </DialogHeader>
          {issuedLogin && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="font-mono font-medium">{issuedLogin.username}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Password</p>
                <p className="font-mono font-medium">{issuedLogin.password}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!issuedLogin) return;
                const text = `Username: ${issuedLogin.username}\nPassword: ${issuedLogin.password}`;
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("Copied to clipboard");
                } catch {
                  toast.error("Could not copy — select and copy manually.");
                }
              }}
            >
              Copy
            </Button>
            <Button type="button" onClick={() => setIssuedLogin(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
