import {
  ensureAssignedEnrollments,
  markStudentOnboardingIfReady,
} from "@/app/(app)/student/actions";
import { formatClassRate, formatLocationType } from "@/lib/class-pricing";
import { createClient } from "@/lib/supabase/server";
import type {
  EnrolledClass,
  InstitutionInvite,
  JoinableOrg,
  LinkedInstitution,
  MarketplaceClass,
  StudentNotification,
  UpcomingSession,
} from "@/components/student/types";
import type { ClassSession, Profile, StudentLink } from "@/types/database";

type StudentLinkRow = StudentLink & {
  organizations: { name: string; type: string } | null;
  batches: { name: string } | null;
};

type EnrollmentRow = {
  source: string;
  classes: {
    id: string;
    title: string;
    skill: string | null;
    status: string;
    is_home_studio: boolean | null;
    location_type: string | null;
    location_note: string | null;
    organizations: { name: string } | null;
    teachers:
      | { profiles: { full_name: string | null } | null }
      | { profiles: { full_name: string | null } | null }[]
      | null;
  } | null;
};

type MarketplaceRow = {
  id: string;
  title: string;
  skill: string | null;
  description: string | null;
  rate_amount: number | null;
  rate_currency: string;
  rate_unit: string;
  location_type: string | null;
  location_note: string | null;
  max_students: number | null;
  is_home_studio: boolean;
  starts_at: string | null;
  organizations?:
    | { name: string; type: string; approval_status: string }
    | { name: string; type: string; approval_status: string }[]
    | null;
  teachers:
    | { profiles: { full_name: string | null } | null }
    | { profiles: { full_name: string | null } | null }[]
    | null;
  class_enrollments: { id: string }[] | null;
};

type NotificationRow = {
  id: string;
  read_at: string | null;
  created_at: string;
  notifications: {
    id: string;
    title: string;
    body: string;
    created_at: string;
    organizations: { name: string } | null;
  } | null;
};

export type StudentDashboardData = {
  needsProfile: boolean;
  joinableOrgs: JoinableOrg[];
  linkedInstitutions: LinkedInstitution[];
  institutionInvites: InstitutionInvite[];
  myClasses: EnrolledClass[];
  upcomingSessions: UpcomingSession[];
  notifications: StudentNotification[];
};

export type BrowseClassesData = {
  marketplaceClasses: MarketplaceClass[];
};

async function prepareStudentProfile(profile: Profile): Promise<boolean> {
  const needsProfile = !profile.full_name?.trim();

  if (!needsProfile && !profile.onboarding_completed) {
    await markStudentOnboardingIfReady(
      profile.id,
      profile.full_name,
      profile.onboarding_completed,
    );
  }

  return needsProfile;
}

function mapEnrollments(enrollments: EnrollmentRow[]): {
  myClasses: EnrolledClass[];
  enrolledClassIds: Set<string>;
} {
  const enrolledClassIds = new Set(
    enrollments.map((row) => row.classes?.id).filter(Boolean) as string[],
  );

  const myClasses: EnrolledClass[] = enrollments
    .filter((row) => row.classes)
    .map((row) => {
      const teacher = Array.isArray(row.classes!.teachers)
        ? row.classes!.teachers[0]
        : row.classes!.teachers;

      return {
        id: row.classes!.id,
        title: row.classes!.title,
        skill: row.classes!.skill,
        source: row.source,
        orgName: row.classes!.organizations?.name ?? null,
        teacherName: teacher?.profiles?.full_name?.trim() || null,
        status: row.classes!.status,
        isHomeStudio: Boolean(row.classes!.is_home_studio),
        canLeave: row.source === "self",
        locationLabel:
          formatLocationType(row.classes!.location_type) ??
          (row.classes!.organizations?.name ? "At school / academy" : null),
        locationNote: row.classes!.location_note,
        nextMeetingAt: null,
        nextMeetingNote: null,
      };
    });

  return { myClasses, enrolledClassIds };
}

function mapMarketplace(
  cls: MarketplaceRow,
  enrolledClassIds: Set<string>,
): MarketplaceClass | null {
  if (enrolledClassIds.has(cls.id)) return null;

  const org = Array.isArray(cls.organizations)
    ? cls.organizations[0]
    : cls.organizations;
  const teacher = Array.isArray(cls.teachers) ? cls.teachers[0] : cls.teachers;
  const enrolledCount = cls.class_enrollments?.length ?? 0;
  const spotsLeft =
    cls.max_students == null
      ? null
      : Math.max(cls.max_students - enrolledCount, 0);

  if (spotsLeft === 0) return null;

  return {
    id: cls.id,
    title: cls.title,
    skill: cls.skill,
    description: cls.description,
    orgName: org?.name ?? null,
    orgType: org?.type ?? null,
    teacherName: teacher?.profiles?.full_name?.trim() || null,
    isHomeStudio: cls.is_home_studio,
    rateLabel: formatClassRate(
      cls.rate_amount,
      cls.rate_currency,
      cls.rate_unit,
    ),
    locationLabel: formatLocationType(cls.location_type),
    locationNote: cls.location_note,
    spotsLeft,
    startsAt: cls.starts_at,
  };
}

export async function loadStudentDashboardData(
  profile: Profile,
): Promise<StudentDashboardData> {
  const supabase = await createClient();
  const needsProfile = await prepareStudentProfile(profile);

  // Attach any invites sent to this email before the account existed.
  await supabase.rpc("claim_student_link_invites");

  const { data: linksData } = await supabase
    .from("student_links")
    .select(
      `
      *,
      organizations (name, type),
      batches (name)
    `,
    )
    .eq("student_profile_id", profile.id);

  const links = (linksData ?? []) as StudentLinkRow[];
  await ensureAssignedEnrollments(profile.id, links);

  const linkedOrgIds = new Set(links.map((link) => link.organization_id));

  const [
    { data: approveOrgs },
    { data: enrollmentsData },
    { data: notificationsData },
    { data: inviteRows },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, type, city")
      .eq("approval_status", "approved")
      .order("name"),
    supabase
      .from("class_enrollments")
      .select(
        `
        source,
        classes (
          id,
          title,
          skill,
          status,
          is_home_studio,
          location_type,
          location_note,
          organizations (name),
          teachers (profiles (full_name))
        )
      `,
      )
      .eq("student_profile_id", profile.id),
    supabase
      .from("notification_recipients")
      .select(
        `
        id,
        read_at,
        created_at,
        notifications (
          id,
          title,
          body,
          created_at,
          organizations (name)
        )
      `,
      )
      .eq("student_profile_id", profile.id),
    supabase
      .from("student_link_requests")
      .select(
        `
        id,
        created_at,
        student_email,
        batches (name),
        organizations (name, type, city)
      `,
      )
      .eq("student_profile_id", profile.id)
      .eq("status", "requested")
      .order("created_at", { ascending: false }),
  ]);

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[];
  const { myClasses, enrolledClassIds } = mapEnrollments(enrollments);

  const joinableOrgs: JoinableOrg[] = (approveOrgs ?? [])
    .filter((org) => !linkedOrgIds.has(org.id))
    .map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      city: org.city,
    }));

  const linkedInstitutions: LinkedInstitution[] = links.map((link) => ({
    id: link.id,
    orgName: link.organizations?.name ?? "Institution",
    orgType: link.organizations?.type ?? "school",
    batchName: link.batches?.name ?? null,
  }));

  const institutionInvites: InstitutionInvite[] = (inviteRows ?? []).map(
    (row) => {
      const org = Array.isArray(row.organizations)
        ? row.organizations[0]
        : row.organizations;
      const batch = Array.isArray(row.batches) ? row.batches[0] : row.batches;
      return {
        id: row.id,
        orgName: org?.name ?? "Institution",
        orgType: org?.type ?? "school",
        orgCity: org?.city ?? null,
        batchName: batch?.name ?? null,
        createdAt: row.created_at,
      };
    },
  );

  const classIds = [...enrolledClassIds];
  const now = new Date().toISOString();
  let upcomingSessions: UpcomingSession[] = [];
  const nextByClass = new Map<string, string>();

  if (classIds.length > 0) {
    const [{ data: sessionsData }, { data: slotEnrollments }] =
      await Promise.all([
        supabase
          .from("class_sessions")
          .select(
            `
            id,
            starts_at,
            ends_at,
            status,
            class_id,
            classes (
              title,
              location_type,
              location_note,
              organizations (name)
            )
          `,
          )
          .in("class_id", classIds)
          .order("starts_at", { ascending: true }),
        supabase
          .from("class_session_enrollments")
          .select("session_id, class_id")
          .eq("student_profile_id", profile.id)
          .in("class_id", classIds),
      ]);

    const slotSessionIds = new Set(
      (slotEnrollments ?? []).map((row) => row.session_id),
    );
    const classesWithSlotPicks = new Set(
      (slotEnrollments ?? []).map((row) => row.class_id),
    );

    const sessions = (sessionsData ?? []) as (ClassSession & {
      classes: {
        title: string;
        location_type: string | null;
        location_note: string | null;
        organizations: { name: string } | null;
      } | null;
    })[];

    const allUpcoming = sessions
      .filter((session) => {
        // Only meetings that are still on — postponed ones leave Next up
        if (session.status !== "scheduled" || session.starts_at < now) {
          return false;
        }
        // Personal classes: only sessions the student picked
        if (classesWithSlotPicks.has(session.class_id)) {
          return slotSessionIds.has(session.id);
        }
        return true;
      })
      .map((session) => {
        const location =
          [
            formatLocationType(session.classes?.location_type),
            session.classes?.location_note,
          ]
            .filter(Boolean)
            .join(" · ") || null;

        return {
          id: session.id,
          classId: session.class_id,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          status: session.status,
          classTitle: session.classes?.title ?? "Class",
          orgName: session.classes?.organizations?.name ?? null,
          location,
        };
      });

    for (const session of allUpcoming) {
      if (!nextByClass.has(session.classId)) {
        nextByClass.set(session.classId, session.startsAt);
      }
    }

    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    upcomingSessions = allUpcoming.filter(
      (session) => new Date(session.startsAt).getTime() <= horizon,
    );
  }

  const enrichedClasses = myClasses.map((cls) => {
    const nextMeetingAt = nextByClass.get(cls.id) ?? null;
    let nextMeetingNote: string | null = null;
    if (!nextMeetingAt) {
      if (cls.status === "accepted" || cls.status === "requested") {
        nextMeetingNote = "Waiting for meetings to be scheduled";
      } else if (cls.status === "cancelled" || cls.status === "completed") {
        nextMeetingNote = null;
      } else {
        nextMeetingNote = "No upcoming meetings";
      }
    }
    return { ...cls, nextMeetingAt, nextMeetingNote };
  });

  const notifications: StudentNotification[] = (
    (notificationsData ?? []) as NotificationRow[]
  )
    .filter((row) => row.notifications)
    .map((row) => ({
      recipientId: row.id,
      title: row.notifications!.title,
      body: row.notifications!.body,
      orgName: row.notifications!.organizations?.name ?? null,
      createdAt: row.notifications!.created_at,
      readAt: row.read_at,
    }))
    .sort((a, b) => {
      const aUnread = a.readAt ? 1 : 0;
      const bUnread = b.readAt ? 1 : 0;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return {
    needsProfile,
    joinableOrgs,
    linkedInstitutions,
    institutionInvites,
    myClasses: enrichedClasses,
    upcomingSessions,
    notifications,
  };
}

export async function loadBrowseClassesData(
  profile: Profile,
): Promise<BrowseClassesData> {
  const supabase = await createClient();

  const [
    { data: enrollmentsData },
    { data: marketplaceOrgData },
    { data: marketplaceHomeData },
  ] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select(
        `
        source,
        classes (
          id,
          title,
          skill,
          status,
          is_home_studio,
          organizations (name)
        )
      `,
      )
      .eq("student_profile_id", profile.id),
    supabase
      .from("classes")
      .select(
        `
        id,
        title,
        skill,
        description,
        rate_amount,
        rate_currency,
        rate_unit,
        location_type,
        location_note,
        max_students,
        is_home_studio,
        starts_at,
        organizations!inner (name, type, approval_status),
        teachers (profiles (full_name)),
        class_enrollments (id)
      `,
      )
      .eq("enrollment_mode", "self_enroll")
      .eq("is_home_studio", false)
      .in("status", ["scheduled", "accepted"])
      .eq("organizations.approval_status", "approved"),
    supabase
      .from("classes")
      .select(
        `
        id,
        title,
        skill,
        description,
        rate_amount,
        rate_currency,
        rate_unit,
        location_type,
        location_note,
        max_students,
        is_home_studio,
        starts_at,
        teachers (profiles (full_name)),
        class_enrollments (id)
      `,
      )
      .eq("enrollment_mode", "self_enroll")
      .eq("is_home_studio", true)
      .in("status", ["scheduled", "accepted"]),
  ]);

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[];
  const { enrolledClassIds } = mapEnrollments(enrollments);

  const marketplaceClasses: MarketplaceClass[] = [
    ...((marketplaceHomeData ?? []) as MarketplaceRow[]),
    ...((marketplaceOrgData ?? []) as MarketplaceRow[]),
  ]
    .map((cls) => mapMarketplace(cls, enrolledClassIds))
    .filter((cls): cls is MarketplaceClass => cls !== null)
    .sort((a, b) => {
      if (a.isHomeStudio !== b.isHomeStudio) return a.isHomeStudio ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  return { marketplaceClasses };
}
