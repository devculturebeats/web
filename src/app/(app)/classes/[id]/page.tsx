import { notFound, redirect } from "next/navigation";

import {
  ClassDetail,
  type ClassDetailData,
  type ClassRosterEntry,
} from "@/components/classes/class-detail";
import { formatClassRate, formatLocationType } from "@/lib/class-pricing";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassSession } from "@/types/database";

type ClassRow = {
  id: string;
  title: string;
  skill: string | null;
  description: string | null;
  status: ClassDetailData["status"];
  enrollment_mode: string;
  is_recurring: boolean;
  is_home_studio: boolean;
  organization_id: string | null;
  batch_id: string | null;
  teacher_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  proposed_day_of_week: number | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  cancellation_reason: string | null;
  location_type: string | null;
  location_note: string | null;
  rate_amount: number | null;
  rate_currency: string;
  rate_unit: string;
  max_students: number | null;
  organizations: { id: string; name: string; type: string } | null;
  teachers: {
    id: string;
    profiles: { full_name: string } | null;
  } | null;
  class_sessions: ClassSession[];
};

function linkMatchesClass(
  link: { organization_id: string; batch_id: string | null },
  cls: { organization_id: string | null; batch_id: string | null },
): boolean {
  if (!cls.organization_id) return false;
  if (link.organization_id !== cls.organization_id) return false;
  if (link.batch_id === null) return true;
  return link.batch_id === cls.batch_id;
}

async function canAccessClass(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>,
  cls: ClassRow,
): Promise<{ allowed: boolean; canManage: boolean }> {
  if (profile.role === "superadmin") {
    return { allowed: true, canManage: true };
  }

  if (
    profile.role === "teacher" &&
    profile.teacher?.id &&
    cls.teacher_id === profile.teacher.id
  ) {
    return { allowed: true, canManage: true };
  }

  if (
    (profile.role === "school_admin" || profile.role === "academy_admin") &&
    cls.organization_id
  ) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("organization_id", cls.organization_id)
      .maybeSingle();

    if (membership) {
      return { allowed: true, canManage: true };
    }
  }

  if (profile.role === "student") {
    const { data: enrollment } = await supabase
      .from("class_enrollments")
      .select("id")
      .eq("class_id", cls.id)
      .eq("student_profile_id", profile.id)
      .maybeSingle();

    if (enrollment) {
      return { allowed: true, canManage: false };
    }

    // Browse open marketplace / home studio listings before enrolling
    if (
      cls.enrollment_mode === "self_enroll" &&
      ["scheduled", "accepted"].includes(cls.status) &&
      (cls.is_home_studio || cls.organization_id)
    ) {
      return { allowed: true, canManage: false };
    }
  }

  return { allowed: false, canManage: false };
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: classRow } = await supabase
    .from("classes")
    .select(
      `
      id,
      title,
      skill,
      description,
      status,
      enrollment_mode,
      is_recurring,
      is_home_studio,
      organization_id,
      batch_id,
      teacher_id,
      starts_at,
      ends_at,
      proposed_day_of_week,
      proposed_start_time,
      proposed_end_time,
      cancellation_reason,
      location_type,
      location_note,
      rate_amount,
      rate_currency,
      rate_unit,
      max_students,
      organizations (id, name, type),
      teachers (
        id,
        profiles (full_name)
      ),
      class_sessions (*)
    `,
    )
    .eq("id", classId)
    .maybeSingle();

  if (!classRow) notFound();

  const cls = classRow as ClassRow;
  const access = await canAccessClass(supabase, profile, cls);
  if (!access.allowed) notFound();

  const sessionIds = cls.class_sessions.map((session) => session.id);

  const [
    { data: enrollments },
    { data: assignedLinks },
    { data: noteRows },
    { data: attendanceRows },
    { data: sessionEnrollments },
  ] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("student_profile_id, source")
      .eq("class_id", classId),
    supabase
      .from("student_links")
      .select("organization_id, batch_id, student_profile_id"),
    supabase
      .from("class_notes")
      .select("id, body, author_id, created_at, profiles:author_id(full_name)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false }),
    sessionIds.length > 0
      ? supabase
          .from("attendance")
          .select("session_id, student_profile_id, present")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] as Attendance[] }),
    supabase
      .from("class_session_enrollments")
      .select("session_id, student_profile_id")
      .eq("class_id", classId),
  ]);

  const profileIds = [
    ...new Set([
      ...(enrollments ?? []).map((row) => row.student_profile_id),
      ...(assignedLinks ?? []).map((row) => row.student_profile_id),
      ...(sessionEnrollments ?? []).map((row) => row.student_profile_id),
    ]),
  ];

  const { data: profileRows } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [] };

  const profileNames = new Map(
    (profileRows ?? []).map((row) => [row.id, row.full_name?.trim() || "Student"]),
  );

  const rosterMap = new Map<string, ClassRosterEntry>();

  for (const enrollment of enrollments ?? []) {
    rosterMap.set(enrollment.student_profile_id, {
      profileId: enrollment.student_profile_id,
      fullName: profileNames.get(enrollment.student_profile_id) ?? "Student",
      source: enrollment.source,
    });
  }

  if (cls.enrollment_mode === "assigned" && cls.organization_id) {
    for (const link of assignedLinks ?? []) {
      if (!linkMatchesClass(link, cls)) continue;
      if (rosterMap.has(link.student_profile_id)) continue;
      rosterMap.set(link.student_profile_id, {
        profileId: link.student_profile_id,
        fullName: profileNames.get(link.student_profile_id) ?? "Student",
        source: "assigned",
      });
    }
  }

  const attendanceBySession: ClassDetailData["attendanceBySession"] = {};
  for (const row of attendanceRows ?? []) {
    if (!attendanceBySession[row.session_id]) {
      attendanceBySession[row.session_id] = {};
    }
    attendanceBySession[row.session_id][row.student_profile_id] = row.present;
  }

  const fullRoster = [...rosterMap.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );

  const rosterBySession: ClassDetailData["rosterBySession"] = {};
  const hasSlotEnrollments = (sessionEnrollments ?? []).length > 0;

  if (cls.is_home_studio && hasSlotEnrollments) {
    for (const session of cls.class_sessions) {
      rosterBySession[session.id] = [];
    }
    for (const row of sessionEnrollments ?? []) {
      const entry = rosterMap.get(row.student_profile_id) ?? {
        profileId: row.student_profile_id,
        fullName: profileNames.get(row.student_profile_id) ?? "Student",
        source: "self",
      };
      if (!rosterBySession[row.session_id]) {
        rosterBySession[row.session_id] = [];
      }
      if (
        !rosterBySession[row.session_id].some(
          (s) => s.profileId === entry.profileId,
        )
      ) {
        rosterBySession[row.session_id].push(entry);
      }
    }
    for (const sessionId of Object.keys(rosterBySession)) {
      rosterBySession[sessionId].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      );
    }
  } else {
    for (const session of cls.class_sessions) {
      rosterBySession[session.id] = fullRoster;
    }
  }

  const sessions = [...cls.class_sessions].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const detail: ClassDetailData = {
    id: cls.id,
    title: cls.title,
    skill: cls.skill,
    description: cls.description,
    status: cls.status,
    enrollmentMode: cls.enrollment_mode,
    isRecurring: cls.is_recurring,
    isHomeStudio: cls.is_home_studio,
    startsAt: cls.starts_at,
    endsAt: cls.ends_at,
    proposedDayOfWeek: cls.proposed_day_of_week,
    proposedStartTime: cls.proposed_start_time,
    proposedEndTime: cls.proposed_end_time,
    cancellationReason: cls.cancellation_reason,
    rateLabel: formatClassRate(
      cls.rate_amount,
      cls.rate_currency,
      cls.rate_unit,
    ),
    locationLabel: formatLocationType(cls.location_type),
    locationNote: cls.location_note,
    maxStudents: cls.max_students,
    org: cls.organizations
      ? {
          id: cls.organizations.id,
          name: cls.organizations.name,
          type: cls.organizations.type,
        }
      : null,
    teacher: cls.teachers
      ? {
          id: cls.teachers.id,
          name: cls.teachers.profiles?.full_name?.trim() || "Teacher",
        }
      : null,
    sessions,
    roster: fullRoster,
    attendanceBySession,
    rosterBySession,
    notes: (noteRows ?? []).map((note) => {
      const author = note.profiles as { full_name: string } | null;
      return {
        id: note.id,
        body: note.body,
        authorId: note.author_id,
        authorName: author?.full_name?.trim() || "Unknown",
        createdAt: note.created_at,
      };
    }),
    canManage: access.canManage,
    canEnroll:
      profile.role === "student" &&
      !rosterMap.has(profile.id) &&
      cls.enrollment_mode === "self_enroll" &&
      ["scheduled", "accepted"].includes(cls.status),
    isEnrolled: profile.role === "student" && rosterMap.has(profile.id),
    currentUserId: profile.id,
  };

  return <ClassDetail data={detail} />;
}
