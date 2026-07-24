"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  addNote,
  cancelClass,
  cancelSessionsScoped,
  deleteNote,
  listReplacementTeachers,
  markAttendance,
  markSessionOutcome,
  postponeSessionTo,
  requestSchoolRematch,
  requestTeacherReplacement,
  rescheduleSession,
  scheduleClassSessions,
  updateSessionStatus,
  type ReplacementCandidate,
} from "@/app/(app)/classes/[id]/actions";
import { EnrollWithSlots } from "@/components/student/enroll-with-slots";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PaginatedList,
} from "@/components/ui/client-pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DAYS_OF_WEEK } from "@/lib/constants";
import {
  formatDateTime,
  formatTime,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/dates";
import type {
  ClassLifecycle,
  ClassSession,
  SessionOutcome,
  SessionScope,
} from "@/types/database";

export type ClassRosterEntry = {
  profileId: string;
  fullName: string;
  source: string;
};

export type ClassNoteEntry = {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
};

export type PendingReplacement = {
  id: string;
  teacherName: string;
  message: string | null;
  createdAt: string;
};

export type ClassDetailData = {
  id: string;
  title: string;
  skill: string | null;
  description: string | null;
  status: ClassLifecycle;
  enrollmentMode: string;
  isRecurring: boolean;
  isHomeStudio: boolean;
  startsAt: string | null;
  endsAt: string | null;
  proposedDayOfWeek: number | null;
  proposedStartTime: string | null;
  proposedEndTime: string | null;
  cancellationReason: string | null;
  rateLabel: string | null;
  locationLabel: string | null;
  locationNote: string | null;
  maxStudents: number | null;
  org: { id: string; name: string; type: string } | null;
  teacher: { id: string; name: string } | null;
  sessions: ClassSession[];
  roster: ClassRosterEntry[];
  attendanceBySession: Record<string, Record<string, boolean>>;
  rosterBySession: Record<string, ClassRosterEntry[]>;
  notes: ClassNoteEntry[];
  pendingReplacements: PendingReplacement[];
  needsRematch: boolean;
  rematchReason: string | null;
  canManage: boolean;
  canReplaceTeacher: boolean;
  canRequestSchoolRematch: boolean;
  isSuperadmin: boolean;
  canEnroll: boolean;
  isEnrolled: boolean;
  currentUserId: string;
};

type ClassDetailProps = {
  data: ClassDetailData;
};

function ScopeRadioGroup({
  value,
  onChange,
  showSeries,
  idPrefix,
}: {
  value: SessionScope;
  onChange: (scope: SessionScope) => void;
  showSeries: boolean;
  idPrefix: string;
}) {
  if (!showSeries) return null;

  const oneId = `${idPrefix}-scope-one`;
  const seriesId = `${idPrefix}-scope-series`;

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as SessionScope)}
      className="gap-2"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="one" id={oneId} />
        <Label htmlFor={oneId} className="font-normal">
          This session only
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="series" id={seriesId} />
        <Label htmlFor={seriesId} className="font-normal">
          This and following in series
        </Label>
      </div>
    </RadioGroup>
  );
}

function AttendancePanel({
  sessionId,
  roster,
  initialAttendance,
}: {
  sessionId: string;
  roster: ClassRosterEntry[];
  initialAttendance: Record<string, boolean>;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const student of roster) {
      map[student.profileId] = initialAttendance[student.profileId] ?? false;
    }
    return map;
  });

  const handleSave = () => {
    startTransition(async () => {
      const records = roster.map((student) => ({
        studentProfileId: student.profileId,
        present: attendance[student.profileId] ?? false,
      }));
      const result = await markAttendance(sessionId, records);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Attendance saved");
    });
  };

  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No enrolled students yet.</p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((value) => !value)}
      >
        Mark attendance
        {open ? (
          <ChevronUpIcon className="size-4" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </button>
      {open && (
        <div className="space-y-3">
          <PaginatedList items={roster} pageSize={25} label="students">
            {(pageItems) => (
              <div className="space-y-2">
                {pageItems.map((student) => (
                  <div
                    key={student.profileId}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      id={`${sessionId}-${student.profileId}`}
                      checked={attendance[student.profileId] ?? false}
                      onCheckedChange={(checked) =>
                        setAttendance((prev) => ({
                          ...prev,
                          [student.profileId]: checked === true,
                        }))
                      }
                    />
                    <Label
                      htmlFor={`${sessionId}-${student.profileId}`}
                      className="font-normal"
                    >
                      {student.fullName}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </PaginatedList>
          <Button size="sm" disabled={isPending} onClick={handleSave}>
            Save attendance
          </Button>
        </div>
      )}
    </div>
  );
}

function PostponeToPanel({ session }: { session: ClassSession }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(() =>
    toDatetimeLocalValue(session.starts_at),
  );
  const [endsAt, setEndsAt] = useState(() =>
    toDatetimeLocalValue(session.ends_at),
  );

  const handlePostpone = () => {
    startTransition(async () => {
      const result = await postponeSessionTo(
        session.id,
        fromDatetimeLocalValue(startsAt),
        fromDatetimeLocalValue(endsAt),
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Session postponed to the new time");
      setOpen(false);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((value) => !value)}
      >
        Postpone to…
        {open ? (
          <ChevronUpIcon className="size-4" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose the new date and time for this session.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`postpone-start-${session.id}`}>New start</Label>
            <Input
              id={`postpone-start-${session.id}`}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`postpone-end-${session.id}`}>New end</Label>
            <Input
              id={`postpone-end-${session.id}`}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <Button size="sm" disabled={isPending} onClick={handlePostpone}>
            {isPending ? "Saving…" : "Postpone to this time"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReschedulePanel({
  session,
  showSeries,
}: {
  session: ClassSession;
  showSeries: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SessionScope>("one");
  const [startsAt, setStartsAt] = useState(() =>
    toDatetimeLocalValue(session.starts_at),
  );
  const [endsAt, setEndsAt] = useState(() =>
    toDatetimeLocalValue(session.ends_at),
  );

  const handleReschedule = () => {
    startTransition(async () => {
      const result = await rescheduleSession(
        session.id,
        fromDatetimeLocalValue(startsAt),
        fromDatetimeLocalValue(endsAt),
        scope,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        scope === "series" ? "Series rescheduled" : "Session rescheduled",
      );
      setOpen(false);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((value) => !value)}
      >
        Reschedule session
        {open ? (
          <ChevronUpIcon className="size-4" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </button>
      {open && (
        <div className="space-y-3">
          <ScopeRadioGroup
            idPrefix={`reschedule-${session.id}`}
            value={scope}
            onChange={setScope}
            showSeries={showSeries}
          />
          <div className="space-y-2">
            <Label htmlFor={`starts-${session.id}`}>New start</Label>
            <Input
              id={`starts-${session.id}`}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ends-${session.id}`}>New end</Label>
            <Input
              id={`ends-${session.id}`}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <Button size="sm" disabled={isPending} onClick={handleReschedule}>
            Save new time
          </Button>
        </div>
      )}
    </div>
  );
}

function outcomeLabel(outcome: SessionOutcome | null | undefined) {
  if (!outcome) return null;
  if (outcome === "held") return "Held";
  if (outcome === "teacher_no_show") return "Teacher no-show";
  if (outcome === "student_no_show") return "Student no-show";
  return outcome;
}

function CancelSessionButton({
  sessionId,
  showSeries,
}: {
  sessionId: string;
  showSeries: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<SessionScope>("one");
  const [reason, setReason] = useState("");

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelSessionsScoped(sessionId, scope, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        scope === "series" ? "Sessions cancelled" : "Session cancelled",
      );
      setReason("");
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="outline" disabled={isPending} />
        }
      >
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel session?</AlertDialogTitle>
          <AlertDialogDescription>
            This marks the session as cancelled. Students will not be unenrolled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ScopeRadioGroup
          idPrefix={`cancel-${sessionId}`}
          value={scope}
          onChange={setScope}
          showSeries={showSeries}
        />
        <div className="space-y-2">
          <Label htmlFor={`cancel-session-reason-${sessionId}`}>
            Reason (optional)
          </Label>
          <Textarea
            id={`cancel-session-reason-${sessionId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this session cancelled?"
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep session</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={handleCancel}
          >
            Cancel session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HeldButton({
  sessionId,
  startsAt,
  label = "Held",
}: {
  sessionId: string;
  startsAt: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const startsMs = new Date(startsAt).getTime();
  const isFuture =
    Number.isFinite(startsMs) && startsMs > Date.now() + 15 * 60 * 1000;

  const handleHeld = () => {
    startTransition(async () => {
      const result = await markSessionOutcome(sessionId, "held");
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Session marked held");
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant={label === "Held" ? "default" : "outline"} disabled={isPending} />
        }
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark session as held?</AlertDialogTitle>
          <AlertDialogDescription>
            {isFuture
              ? "This session hasn’t started yet. Mark it held after the class time."
              : "Confirms the session took place as planned."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Back</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || isFuture}
            onClick={handleHeld}
          >
            Mark held
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NoShowButtons({ sessionId }: { sessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState<SessionOutcome | null>(null);

  const handleConfirm = (outcome: SessionOutcome) => {
    startTransition(async () => {
      const result = await markSessionOutcome(sessionId, outcome, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        outcome === "teacher_no_show"
          ? "Marked teacher no-show"
          : "Marked student no-show",
      );
      setReason("");
      setOpen(null);
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setOpen("teacher_no_show")}
      >
        Teacher no-show
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setOpen("student_no_show")}
      >
        Student no-show
      </Button>
      <AlertDialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {open === "teacher_no_show"
                ? "Mark teacher no-show?"
                : "Mark student no-show?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open === "teacher_no_show"
                ? "Records that the teacher did not attend. The session is cancelled."
                : "Records that students did not attend while the teacher was available."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`noshow-reason-${sessionId}`}>
              Reason (optional)
            </Label>
            <Textarea
              id={`noshow-reason-${sessionId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending || !open}
              onClick={() => open && handleConfirm(open)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SessionRow({
  session,
  roster,
  attendance,
  canManage,
  showSeries,
}: {
  session: ClassSession;
  roster: ClassRosterEntry[];
  attendance: Record<string, boolean>;
  canManage: boolean;
  showSeries: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const open = session.status === "scheduled" || session.status === "postponed";

  const handleStatus = (status: ClassLifecycle) => {
    startTransition(async () => {
      const result = await updateSessionStatus(session.id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Session marked ${status}`);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {formatDateTime(session.starts_at)}
          </p>
          <p className="text-xs text-muted-foreground">
            until {formatDateTime(session.ends_at)}
          </p>
          {session.session_note && (
            <p className="mt-1 text-xs text-muted-foreground">
              {session.session_note}
            </p>
          )}
          {session.outcome && (
            <p className="mt-1 text-xs font-medium">
              Outcome: {outcomeLabel(session.outcome)}
            </p>
          )}
          {session.cancellation_reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reason: {session.cancellation_reason}
            </p>
          )}
        </div>
        <LifecycleBadge status={session.status} />
      </div>

      {canManage && open && (
        <>
          <div className="flex flex-wrap gap-2">
            <CancelSessionButton
              sessionId={session.id}
              showSeries={showSeries}
            />
            <HeldButton sessionId={session.id} startsAt={session.starts_at} />
            <NoShowButtons sessionId={session.id} />
          </div>
          {session.status === "scheduled" && (
            <>
              <PostponeToPanel session={session} />
              <ReschedulePanel session={session} showSeries={showSeries} />
            </>
          )}
          {session.status === "postponed" && (
            <ReschedulePanel session={session} showSeries={showSeries} />
          )}
          <AttendancePanel
            sessionId={session.id}
            roster={roster}
            initialAttendance={attendance}
          />
        </>
      )}

      {canManage && !open && !session.outcome && (
        <div className="flex flex-wrap gap-2">
          <HeldButton
            sessionId={session.id}
            startsAt={session.starts_at}
            label="Mark held"
          />
          <NoShowButtons sessionId={session.id} />
          {session.status === "cancelled" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => handleStatus("scheduled")}
            >
              Reopen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ReplaceTeacherPanel({
  classId,
  orgType,
  currentTeacherName,
  pending,
  canReplace,
  canRequestSchoolRematch,
  needsRematch,
  rematchReason,
  isSuperadmin,
}: {
  classId: string;
  orgType: string | null;
  currentTeacherName: string | null;
  pending: PendingReplacement[];
  canReplace: boolean;
  canRequestSchoolRematch: boolean;
  needsRematch: boolean;
  rematchReason: string | null;
  isSuperadmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [teachers, setTeachers] = useState<ReplacementCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [teacherId, setTeacherId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [direct, setDirect] = useState(false);

  const loadTeachers = () => {
    if (loaded || !canReplace) return;
    startTransition(async () => {
      const result = await listReplacementTeachers(classId);
      if (result.error && !(result.teachers && result.teachers.length === 0)) {
        toast.error(result.error);
        return;
      }
      setTeachers(result.teachers ?? []);
      setLoaded(true);
    });
  };

  // Schools flag CultureBeats (same as submitting a need); they don't pick teachers.
  if (canRequestSchoolRematch && !canReplace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Need a replacement?</CardTitle>
          <CardDescription>
            Same as a new teacher need: ask CultureBeats to match another
            teacher. You don&apos;t assign teachers directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {needsRematch ? (
            <p className="text-sm text-muted-foreground">
              Rematch requested
              {rematchReason ? `: ${rematchReason}` : ""}. CultureBeats will
              match a replacement from School requests.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor={`school-rematch-reason-${classId}`}>
                  Reason (optional)
                </Label>
                <Textarea
                  id={`school-rematch-reason-${classId}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why do you need a new teacher?"
                  rows={2}
                />
              </div>
              <Button
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await requestSchoolRematch(classId, reason);
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Rematch sent to CultureBeats");
                    setReason("");
                  });
                }}
              >
                Ask CultureBeats to rematch
              </Button>
            </>
          )}
          {pending.length > 0 && (
            <div className="space-y-1 text-sm text-muted-foreground">
              {pending.map((row) => (
                <p key={row.id}>
                  Pending with teacher: {row.teacherName}
                  {row.message ? ` — ${row.message}` : ""}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!canReplace) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {orgType === "school" ? "Rematch teacher" : "Find replacement"}
        </CardTitle>
        <CardDescription>
          {currentTeacherName
            ? `Current teacher: ${currentTeacherName}. `
            : "No teacher assigned. "}
          {orgType === "academy"
            ? "Same as assigning the first time: choose a linked academy member. They must accept before the swap."
            : "Same as matching a school need: send a request to a teacher (or swap directly)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length > 0 && (
          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            {pending.map((row) => (
              <p key={row.id}>
                Pending request:{" "}
                <span className="font-medium">{row.teacherName}</span>
                {row.message ? ` — ${row.message}` : ""}
              </p>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <Label>Replacement teacher</Label>
          <Select
            value={teacherId || undefined}
            onValueChange={(value) => setTeacherId(value ?? "")}
          >
            <SelectTrigger className="w-full" onClick={loadTeachers}>
              <SelectValue
                placeholder={
                  isPending && !loaded ? "Loading…" : "Select teacher"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.primarySkill ? ` · ${teacher.primarySkill}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`replace-reason-${classId}`}>Reason (optional)</Label>
          <Textarea
            id={`replace-reason-${classId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why does this class need a new teacher?"
            rows={2}
          />
        </div>
        {isSuperadmin && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`direct-replace-${classId}`}
              checked={direct}
              onCheckedChange={(checked) => setDirect(checked === true)}
            />
            <Label
              htmlFor={`direct-replace-${classId}`}
              className="font-normal"
            >
              Swap immediately without teacher consent
            </Label>
          </div>
        )}
        <Button
          disabled={isPending || !teacherId}
          onClick={() => {
            startTransition(async () => {
              const result = await requestTeacherReplacement(
                classId,
                teacherId,
                reason,
                { direct: isSuperadmin && direct },
              );
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success(
                isSuperadmin && direct
                  ? "Teacher replaced"
                  : "Replacement request sent",
              );
              setTeacherId("");
              setReason("");
              setDirect(false);
            });
          }}
        >
          {isSuperadmin && direct ? "Replace now" : "Send replacement request"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CancelClassButton({
  classId,
  classTitle,
}: {
  classId: string;
  classTitle: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelClass(classId, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Class cancelled");
      setReason("");
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive" disabled={isPending} />
        }
      >
        Cancel class
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {classTitle}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cancels all open sessions and pending requests for this class.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cancel-reason-${classId}`}>Reason (optional)</Label>
          <Textarea
            id={`cancel-reason-${classId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Let participants know why..."
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep class</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={handleCancel}
          >
            Cancel class
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScheduleSessionsPanel({
  classId,
  proposedDayOfWeek,
  proposedStartTime,
  proposedEndTime,
}: {
  classId: string;
  proposedDayOfWeek: number | null;
  proposedStartTime: string | null;
  proposedEndTime: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [weeks, setWeeks] = useState("0");

  const defaults = useMemo(() => {
    const base = new Date();
    // Prefer the next occurrence of the proposed weekday when available
    if (proposedDayOfWeek != null) {
      const delta = (proposedDayOfWeek - base.getDay() + 7) % 7;
      base.setDate(base.getDate() + (delta === 0 ? 7 : delta));
    } else {
      base.setDate(base.getDate() + 1);
    }
    base.setSeconds(0, 0);

    const start = new Date(base);
    const end = new Date(base);
    if (proposedStartTime && proposedEndTime) {
      const [sh, sm] = proposedStartTime.split(":").map(Number);
      const [eh, em] = proposedEndTime.split(":").map(Number);
      start.setHours(sh, sm || 0, 0, 0);
      end.setHours(eh, em || 0, 0, 0);
    } else {
      start.setHours(17, 0, 0, 0);
      end.setHours(18, 0, 0, 0);
    }

    return {
      startsAt: toDatetimeLocalValue(start.toISOString()),
      endsAt: toDatetimeLocalValue(end.toISOString()),
    };
  }, [proposedDayOfWeek, proposedStartTime, proposedEndTime]);

  const [startsAt, setStartsAt] = useState(defaults.startsAt);
  const [endsAt, setEndsAt] = useState(defaults.endsAt);

  const handleSchedule = () => {
    startTransition(async () => {
      const result = await scheduleClassSessions(
        classId,
        fromDatetimeLocalValue(startsAt),
        fromDatetimeLocalValue(endsAt),
        parseInt(weeks, 10) || 0,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Timings added");
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">Add meeting timings</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No calendar meetings yet. Create them from the requested weekly slot,
          or pick a first meeting time below.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`schedule-start-${classId}`}>First meeting starts</Label>
          <Input
            id={`schedule-start-${classId}`}
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`schedule-end-${classId}`}>Ends</Label>
          <Input
            id={`schedule-end-${classId}`}
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`schedule-weeks-${classId}`}>
          Extra weekly repeats (0 = just once, up to 8)
        </Label>
        <Input
          id={`schedule-weeks-${classId}`}
          type="number"
          min={0}
          max={8}
          value={weeks}
          onChange={(event) => setWeeks(event.target.value)}
        />
      </div>
      <Button size="sm" disabled={isPending} onClick={handleSchedule}>
        {isPending ? "Saving…" : "Create timings"}
      </Button>
    </div>
  );
}

function NotesSection({
  classId,
  notes,
  canManage,
  currentUserId,
}: {
  classId: string;
  notes: ClassNoteEntry[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  const handleAdd = () => {
    startTransition(async () => {
      const result = await addNote(classId, body);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Note added");
      setBody("");
    });
  };

  const handleDelete = (noteId: string) => {
    startTransition(async () => {
      const result = await deleteNote(noteId, classId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Note deleted");
    });
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="space-y-2">
          <Label htmlFor="new-note">Add a note</Label>
          <Textarea
            id="new-note"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Shared notes for teachers and admins..."
            rows={3}
          />
          <Button size="sm" disabled={isPending || !body.trim()} onClick={handleAdd}>
            Add note
          </Button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {note.authorName} · {formatDateTime(note.createdAt)}
                  </p>
                </div>
                {canManage && note.authorId === currentUserId && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleDelete(note.id)}
                  >
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClassDetail({ data }: ClassDetailProps) {
  const proposedDayLabel = useMemo(() => {
    if (data.proposedDayOfWeek == null) return null;
    return DAYS_OF_WEEK.find((day) => day.value === data.proposedDayOfWeek)?.label;
  }, [data.proposedDayOfWeek]);

  const upcomingSessions = useMemo(
    () =>
      data.sessions.filter(
        (session) =>
          session.status === "scheduled" || session.status === "postponed",
      ),
    [data.sessions],
  );

  const pastSessions = useMemo(
    () =>
      data.sessions.filter(
        (session) =>
          session.status === "completed" || session.status === "cancelled",
      ),
    [data.sessions],
  );

  const seriesSessionCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of data.sessions) {
      if (!session.series_id) continue;
      counts.set(session.series_id, (counts.get(session.series_id) ?? 0) + 1);
    }
    return counts;
  }, [data.sessions]);

  const hasSeries = (session: ClassSession) =>
    !!session.series_id && (seriesSessionCount.get(session.series_id) ?? 0) > 1;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{data.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {data.isHomeStudio
                ? "Home studio"
                : (data.org?.name ?? "Independent")}
              {data.skill && data.skill !== data.title
                ? ` · ${data.skill}`
                : ""}
              {data.teacher ? ` · ${data.teacher.name}` : ""}
            </p>
          </div>
          <LifecycleBadge status={data.status} />
        </div>
        {data.canManage && data.status !== "cancelled" && (
          <div className="mt-4">
            <CancelClassButton classId={data.id} classTitle={data.title} />
          </div>
        )}
        {data.cancellationReason && (
          <p className="mt-3 text-sm text-muted-foreground">
            Cancelled: {data.cancellationReason}
          </p>
        )}
        {!data.canManage && data.canEnroll && (
          <div className="mt-4">
            <EnrollWithSlots
              classId={data.id}
              sessions={data.sessions}
              requireSlots={data.isHomeStudio}
            />
          </div>
        )}
        {!data.canManage && data.isEnrolled && data.isHomeStudio && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              You&apos;re enrolled. You can still add more slots below.
            </p>
            <EnrollWithSlots
              classId={data.id}
              sessions={data.sessions}
              requireSlots
            />
          </div>
        )}
        {!data.canManage && data.isEnrolled && !data.isHomeStudio && (
          <p className="mt-3 text-sm text-muted-foreground">
            You&apos;re enrolled in this class.
          </p>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-fit flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">
            Timings ({data.sessions.length})
          </TabsTrigger>
          {data.canManage && (
            <>
              <TabsTrigger value="roster">
                Students ({data.roster.length})
              </TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="notes">Notes ({data.notes.length})</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.description && (
                <p className="leading-relaxed text-foreground/90">
                  {data.description}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Who joins:</span>{" "}
                {data.enrollmentMode === "self_enroll"
                  ? "Anyone can enroll themselves"
                  : "Students from the school / academy"}
                {data.isHomeStudio ? " · Your personal class" : ""}
              </p>
              {data.rateLabel && (
                <p>
                  <span className="text-muted-foreground">Rate:</span>{" "}
                  {data.rateLabel}
                </p>
              )}
              {data.locationLabel && (
                <p>
                  <span className="text-muted-foreground">Location:</span>{" "}
                  {data.locationLabel}
                  {data.locationNote ? ` · ${data.locationNote}` : ""}
                </p>
              )}
              {data.maxStudents != null && (
                <p>
                  <span className="text-muted-foreground">Capacity:</span>{" "}
                  {data.roster.length}/{data.maxStudents} students
                </p>
              )}
              {data.isRecurring && (
                <p>
                  <span className="text-muted-foreground">Type:</span> Recurring
                </p>
              )}
              {data.startsAt && (
                <p>
                  <span className="text-muted-foreground">Starts:</span>{" "}
                  {formatDateTime(data.startsAt)}
                </p>
              )}
              {proposedDayLabel && data.proposedStartTime && data.proposedEndTime && (
                <p>
                  <span className="text-muted-foreground">
                    Agreed weekly slot:
                  </span>{" "}
                  {proposedDayLabel}{" "}
                  {formatTime(data.proposedStartTime.slice(0, 5))} –{" "}
                  {formatTime(data.proposedEndTime.slice(0, 5))}
                </p>
              )}
              {data.cancellationReason && (
                <p>
                  <span className="text-muted-foreground">Cancellation reason:</span>{" "}
                  {data.cancellationReason}
                </p>
              )}
            </CardContent>
          </Card>

          {data.canManage &&
            data.org &&
            data.status !== "cancelled" &&
            data.status !== "rejected" &&
            (data.canReplaceTeacher || data.canRequestSchoolRematch) && (
              <ReplaceTeacherPanel
                classId={data.id}
                orgType={data.org.type}
                currentTeacherName={data.teacher?.name ?? null}
                pending={data.pendingReplacements}
                canReplace={data.canReplaceTeacher}
                canRequestSchoolRematch={data.canRequestSchoolRematch}
                needsRematch={data.needsRematch}
                rematchReason={data.rematchReason}
                isSuperadmin={data.isSuperadmin}
              />
            )}
        </TabsContent>

        <TabsContent value="sessions" className="mt-4 space-y-4">
          {data.sessions.length === 0 ? (
            <div className="space-y-4">
              {proposedDayLabel &&
                data.proposedStartTime &&
                data.proposedEndTime && (
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                    <p className="font-medium">Agreed weekly slot</p>
                    <p className="mt-1 text-muted-foreground">
                      {proposedDayLabel}{" "}
                      {formatTime(data.proposedStartTime.slice(0, 5))} –{" "}
                      {formatTime(data.proposedEndTime.slice(0, 5))}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      This is the pattern you and the school agreed on — not
                      calendar meetings yet.
                    </p>
                  </div>
                )}
              {data.canManage &&
              ["accepted", "scheduled"].includes(data.status) ? (
                <ScheduleSessionsPanel
                  classId={data.id}
                  proposedDayOfWeek={data.proposedDayOfWeek}
                  proposedStartTime={data.proposedStartTime}
                  proposedEndTime={data.proposedEndTime}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No meeting timings scheduled yet.
                </p>
              )}
            </div>
          ) : (
            <>
              {upcomingSessions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Upcoming</h3>
                  <PaginatedList
                    items={upcomingSessions}
                    pageSize={10}
                    label="sessions"
                  >
                    {(pageItems) => (
                      <div className="space-y-3">
                        {pageItems.map((session) => (
                          <SessionRow
                            key={session.id}
                            session={session}
                            roster={
                              data.rosterBySession[session.id] ?? data.roster
                            }
                            attendance={
                              data.attendanceBySession[session.id] ?? {}
                            }
                            canManage={data.canManage}
                            showSeries={hasSeries(session)}
                          />
                        ))}
                      </div>
                    )}
                  </PaginatedList>
                </div>
              )}
              {pastSessions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Past</h3>
                  <PaginatedList
                    items={pastSessions}
                    pageSize={10}
                    label="sessions"
                  >
                    {(pageItems) => (
                      <div className="space-y-3">
                        {pageItems.map((session) => (
                          <SessionRow
                            key={session.id}
                            session={session}
                            roster={
                              data.rosterBySession[session.id] ?? data.roster
                            }
                            attendance={
                              data.attendanceBySession[session.id] ?? {}
                            }
                            canManage={data.canManage}
                            showSeries={hasSeries(session)}
                          />
                        ))}
                      </div>
                    )}
                  </PaginatedList>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          {!data.canManage ? null : data.roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students enrolled.</p>
          ) : (
            <PaginatedList items={data.roster} pageSize={25} label="students">
              {(pageItems) => (
                <ul className="divide-y rounded-lg border">
                  {pageItems.map((student) => (
                    <li
                      key={student.profileId}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="font-medium">{student.fullName}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {student.source}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PaginatedList>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          {data.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sessions to show attendance for.
            </p>
          ) : (
            <PaginatedList items={data.sessions} pageSize={10} label="sessions">
              {(pageItems) => (
                <div className="space-y-4">
                  {pageItems.map((session) => {
                    const records =
                      data.attendanceBySession[session.id] ?? {};
                    const sessionRoster =
                      data.rosterBySession[session.id] ?? data.roster;
                    const markedCount =
                      Object.values(records).filter(Boolean).length;
                    return (
                      <Card key={session.id}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">
                            {formatDateTime(session.starts_at)}
                          </CardTitle>
                          <CardDescription>
                            {markedCount} present · {sessionRoster.length}{" "}
                            enrolled
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {sessionRoster.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No students enrolled in this slot.
                            </p>
                          ) : (
                            <PaginatedList
                              items={sessionRoster}
                              pageSize={25}
                              label="students"
                            >
                              {(rosterPage) => (
                                <ul className="space-y-1 text-sm">
                                  {rosterPage.map((student) => (
                                    <li
                                      key={student.profileId}
                                      className="flex justify-between"
                                    >
                                      <span>{student.fullName}</span>
                                      <span className="text-muted-foreground">
                                        {student.profileId in records
                                          ? records[student.profileId]
                                            ? "Present"
                                            : "Absent"
                                          : "Not marked"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </PaginatedList>
                          )}
                          {data.canManage &&
                            session.status === "scheduled" && (
                              <div className="mt-3">
                                <AttendancePanel
                                  sessionId={session.id}
                                  roster={sessionRoster}
                                  initialAttendance={records}
                                />
                              </div>
                            )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </PaginatedList>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesSection
            classId={data.id}
            notes={data.notes}
            canManage={data.canManage}
            currentUserId={data.currentUserId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
