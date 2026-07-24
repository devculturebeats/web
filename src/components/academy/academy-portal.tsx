"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  cancelClass,
  createMarketplaceClass,
  sendNotification,
} from "@/app/(app)/academy/actions";
import { AcademyFindTeachers } from "@/components/academy/academy-find-teachers";
import {
  AcademyTeachersPanel,
  type LinkedAcademyTeacher,
  type PendingTeacherInvite,
} from "@/components/academy/academy-teachers-panel";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ApprovalBadge } from "@/components/org/approval-badge";
import { AuditLogList } from "@/components/admin/audit-log-list";
import { BatchesPanel } from "@/components/org/batches-panel";
import { CancelClassDialog } from "@/components/org/cancel-class-dialog";
import { NotifyPanel } from "@/components/org/notify-panel";
import { PendingApprovalBanner } from "@/components/org/pending-approval-banner";
import { StudentsPanel, type LinkedStudent, type PendingStudentInvite } from "@/components/org/students-panel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ART_SKILLS, CLASS_LOCATION_TYPES, RATE_UNITS } from "@/lib/constants";
import type { AuditLogWithActor } from "@/lib/audit";
import type {
  Batch,
  ClassRow,
  ClassSession,
  Organization,
} from "@/types/database";

const classSchema = z.object({
  title: z.string().min(1, "Title is required"),
  skill: z.string().min(1, "Skill is required"),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  teacher_id: z.string().optional(),
  batch_id: z.string().optional(),
  recurring_weeks: z.string().optional(),
  description: z.string().optional(),
  rate_amount: z.string().optional(),
  rate_unit: z.string().optional(),
  max_students: z.string().optional(),
  location_type: z.string().optional(),
});

type ClassFormValues = z.infer<typeof classSchema>;

export type AcademyClass = ClassRow & {
  enrollment_count: number;
  sessions: ClassSession[];
  teacher: { profiles: { full_name: string } | null } | null;
};

export type ApprovedTeacher = {
  id: string;
  primary_skill: string | null;
  profiles: { full_name: string } | null;
};

type AcademyPortalProps = {
  org: Organization;
  batches: Batch[];
  students: LinkedStudent[];
  pendingInvites?: PendingStudentInvite[];
  linkedTeachers: LinkedAcademyTeacher[];
  pendingTeacherInvites?: PendingTeacherInvite[];
  classes: AcademyClass[];
  teachers: ApprovedTeacher[];
  auditLogs: AuditLogWithActor[];
};

export function AcademyPortal({
  org,
  batches,
  students,
  pendingInvites = [],
  linkedTeachers,
  pendingTeacherInvites = [],
  classes,
  teachers,
  auditLogs,
}: AcademyPortalProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isApproved = org.approval_status === "approved";

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      title: "",
      skill: "",
      starts_at: "",
      ends_at: "",
      teacher_id: "",
      batch_id: "",
      recurring_weeks: "0",
      description: "",
      rate_amount: "",
      rate_unit: "session",
      max_students: "",
      location_type: "at_org",
    },
  });

  const onSubmit = (values: ClassFormValues) => {
    const formData = new FormData();
    Object.entries(values).forEach(([key, val]) => {
      if (val) formData.set(key, val);
    });

    startTransition(async () => {
      const result = await createMarketplaceClass(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Class created.");
      reset();
      setShowCreateForm(false);
    });
  };

  const handleCancelClass = async (classId: string, reason: string) => {
    const result = await cancelClass(classId, reason.trim() || undefined);
    if (result.error) return { error: result.error };
  };

  const notifyClasses = classes.map((cls) => ({ id: cls.id, title: cls.title }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Academy ID {org.lookup_code}
            {[org.city, org.area].filter(Boolean).length
              ? ` · ${[org.city, org.area].filter(Boolean).join(", ")}`
              : ""}
          </p>
        </div>
        <ApprovalBadge status={org.approval_status} />
      </div>

      <PendingApprovalBanner status={org.approval_status} />

      <Tabs defaultValue="classes">
        <TabsList className="w-full flex-wrap justify-start">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="teachers">Discover teachers</TabsTrigger>
          <TabsTrigger value="find">Assign teachers</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="notify">Notify</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="mt-4 space-y-6">
          {!showCreateForm ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-primary/25 bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Open a class for students</p>
                <p className="text-sm text-muted-foreground">
                  Set a time, rate, and publish so students can enroll.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!isApproved}
                onClick={() => setShowCreateForm(true)}
              >
                Publish a class
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4 rounded-lg border p-4"
            >
              <fieldset disabled={!isApproved || isPending} className="space-y-4">
                <h3 className="font-medium">Open a class for students</h3>

                <div className="space-y-2">
                  <Label htmlFor="academy_title">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input id="academy_title" placeholder="Class title" {...register("title")} />
                  {errors.title && (
                    <p className="text-sm text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Skill</Label>
                    <Controller
                      name="skill"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select skill" />
                          </SelectTrigger>
                          <SelectContent>
                            {ART_SKILLS.map((skill) => (
                              <SelectItem key={skill} value={skill}>
                                {skill}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teacher (optional)</Label>
                    <Controller
                      name="teacher_id"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value || "none"}
                          onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Assign later" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No teacher yet</SelectItem>
                            {teachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.profiles?.full_name ?? "Teacher"} (
                                {teacher.primary_skill})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="academy_description">Description</Label>
                  <Textarea
                    id="academy_description"
                    rows={2}
                    placeholder="What students will learn…"
                    {...register("description")}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="starts_at">Starts at</Label>
                    <Input id="starts_at" type="datetime-local" {...register("starts_at")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ends_at">Ends at</Label>
                    <Input id="ends_at" type="datetime-local" {...register("ends_at")} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="academy_rate">Rate (₹)</Label>
                    <Input
                      id="academy_rate"
                      type="number"
                      min={0}
                      step={50}
                      placeholder="600"
                      {...register("rate_amount")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rate unit</Label>
                    <Controller
                      name="rate_unit"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value || "session"}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RATE_UNITS.map((unit) => (
                              <SelectItem key={unit.value} value={unit.value}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="academy_capacity">Max students</Label>
                    <Input
                      id="academy_capacity"
                      type="number"
                      min={1}
                      placeholder="12"
                      {...register("max_students")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Controller
                    name="location_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || "at_org"}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLASS_LOCATION_TYPES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {batches.length > 0 && (
                    <div className="space-y-2">
                      <Label>Batch (optional)</Label>
                      <Controller
                        name="batch_id"
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value || "none"}
                            onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select batch" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No batch</SelectItem>
                              {batches.map((batch) => (
                                <SelectItem key={batch.id} value={batch.id}>
                                  {batch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="recurring_weeks">
                      Extra weekly repeats (0 = just once, up to 8)
                    </Label>
                    <Input
                      id="recurring_weeks"
                      type="number"
                      min={0}
                      max={8}
                      {...register("recurring_weeks")}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!isApproved || isPending}>
                    {isPending ? "Publishing..." : "Publish for enrollment"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            </form>
          )}

          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <PaginatedList items={classes} pageSize={10} label="classes">
              {(pageItems) => (
                <ul className="space-y-4">
                  {pageItems.map((cls) => {
                    const upcoming = [...cls.sessions]
                      .sort(
                        (a, b) =>
                          new Date(a.starts_at).getTime() -
                          new Date(b.starts_at).getTime(),
                      )
                      .slice(0, 3);

                    return (
                      <li key={cls.id} className="rounded-lg border px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              <Link
                                href={`/classes/${cls.id}`}
                                className="hover:underline"
                              >
                                {cls.title}
                              </Link>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {[
                                cls.skill && cls.skill !== cls.title
                                  ? cls.skill
                                  : null,
                                cls.teacher?.profiles?.full_name ?? null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {cls.starts_at && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {new Date(cls.starts_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <LifecycleBadge status={cls.status} />
                              {cls.status !== "cancelled" && (
                                <CancelClassDialog
                                  classTitle={cls.title}
                                  disabled={!isApproved}
                                  onConfirm={(reason) =>
                                    handleCancelClass(cls.id, reason)
                                  }
                                />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {cls.enrollment_count} enrolled
                            </span>
                          </div>
                        </div>

                        {upcoming.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <ul className="space-y-1 text-sm text-muted-foreground">
                              {upcoming.map((session) => (
                                <li
                                  key={session.id}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span>
                                    {new Date(
                                      session.starts_at,
                                    ).toLocaleString()}{" "}
                                    –{" "}
                                    {new Date(
                                      session.ends_at,
                                    ).toLocaleTimeString()}
                                  </span>
                                  <LifecycleBadge status={session.status} />
                                </li>
                              ))}
                            </ul>
                            <Link
                              href={`/classes/${cls.id}`}
                              className="inline-block text-sm font-medium text-primary hover:underline"
                            >
                              Open class
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </PaginatedList>
          )}
        </TabsContent>

        <TabsContent value="teachers" className="mt-4">
          <AcademyTeachersPanel
            teachers={linkedTeachers}
            pendingInvites={pendingTeacherInvites}
            disabled={!isApproved}
          />
        </TabsContent>

        <TabsContent value="find" className="mt-4">
          <AcademyFindTeachers org={org} />
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <BatchesPanel batches={batches} disabled={!isApproved} />
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <StudentsPanel
            students={students}
            pendingInvites={pendingInvites}
            batches={batches}
            disabled={!isApproved}
          />
        </TabsContent>

        <TabsContent value="notify" className="mt-4">
          <NotifyPanel
            classes={notifyClasses}
            disabled={!isApproved}
            onSend={sendNotification}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <AuditLogList logs={auditLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
