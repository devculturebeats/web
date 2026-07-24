"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { formatLocationType } from "@/lib/class-pricing";
import type {
  EnrolledClass,
  UpcomingSession,
} from "@/components/student/types";
import {
  PARENT_SELECTED_STUDENT_COOKIE,
  type LinkedChild,
  type ParentActionState,
  type ParentLinkInvite,
} from "@/lib/parent/types";

function revalidateParentPaths() {
  revalidatePath("/parent");
  revalidatePath("/parent/courses");
  revalidatePath("/dashboard");
}

export async function setSelectedChild(
  studentProfileId: string,
): Promise<ParentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "parent") {
    return { error: "Not allowed." };
  }

  const supabase = await createClient();
  const { data: link } = await supabase
    .from("parent_student_links")
    .select("id")
    .eq("parent_profile_id", profile.id)
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();

  if (!link) return { error: "Student is not linked to your account." };

  const jar = await cookies();
  jar.set(PARENT_SELECTED_STUDENT_COOKIE, studentProfileId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidateParentPaths();
  return { success: true };
}

export async function requestLinkToStudent(
  formData: FormData,
): Promise<ParentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "parent") {
    return { error: "Not allowed." };
  }

  const email = (formData.get("email") as string)?.trim() || null;
  const lookupCode = (formData.get("lookup_code") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim() || null;

  if (!email && !lookupCode) {
    return { error: "Enter the student’s email or 6-digit ID." };
  }

  const supabase = await createClient();
  await supabase.rpc("claim_parent_link_invites");

  const { error } = await supabase.rpc("request_parent_student_link", {
    p_as: "parent",
    p_counterpart_email: email,
    p_counterpart_lookup_code: lookupCode,
    p_message: message,
  });

  if (error) return { error: error.message };

  revalidateParentPaths();
  return { success: true };
}

export async function respondToParentLinkRequest(
  requestId: string,
  accept: boolean,
): Promise<ParentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "parent" && profile.role !== "student")) {
    return { error: "Not allowed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_parent_link_request", {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) return { error: error.message };

  revalidateParentPaths();
  revalidatePath("/student/courses");
  return { success: true };
}

export async function requestLinkToParent(
  formData: FormData,
): Promise<ParentActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { error: "Not allowed." };
  }

  const email = (formData.get("email") as string)?.trim();
  const message = (formData.get("message") as string)?.trim() || null;
  if (!email) return { error: "Parent email is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_parent_student_link", {
    p_as: "student",
    p_counterpart_email: email,
    p_message: message,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function loadParentHomeData(parentId: string): Promise<{
  children: LinkedChild[];
  selectedChildId: string | null;
  pendingIncoming: ParentLinkInvite[];
  pendingOutgoing: ParentLinkInvite[];
  upcomingSessions: UpcomingSession[];
  myClasses: EnrolledClass[];
}> {
  const supabase = await createClient();
  await supabase.rpc("claim_parent_link_invites");

  const { data: links } = await supabase
    .from("parent_student_links")
    .select(
      `
      id,
      student_profile_id,
      profiles:student_profile_id (full_name, email, lookup_code)
    `,
    )
    .eq("parent_profile_id", parentId)
    .order("created_at", { ascending: true });

  const children: LinkedChild[] = (links ?? []).map((row) => {
    const student = (
      Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    ) as {
      full_name: string;
      email: string;
      lookup_code: string | null;
    } | null;
    return {
      linkId: row.id,
      studentProfileId: row.student_profile_id,
      fullName: student?.full_name?.trim() || "Student",
      email: student?.email ?? "",
      lookupCode: student?.lookup_code ?? null,
    };
  });

  const jar = await cookies();
  const cookieId = jar.get(PARENT_SELECTED_STUDENT_COOKIE)?.value ?? null;
  const selectedChildId =
    children.find((c) => c.studentProfileId === cookieId)?.studentProfileId ??
    children[0]?.studentProfileId ??
    null;

  const { data: requestRows } = await supabase
    .from("parent_link_requests")
    .select(
      `
      id,
      initiator,
      message,
      created_at,
      parent_profile_id,
      parent_email,
      student_profile_id,
      student_email,
      parent:parent_profile_id (full_name, email),
      student:student_profile_id (full_name, email)
    `,
    )
    .eq("status", "requested")
    .or(
      `parent_profile_id.eq.${parentId},student_profile_id.eq.${parentId}`,
    );

  // Also catch email-matched requests claimed to parent
  const { data: emailRequests } = await supabase
    .from("parent_link_requests")
    .select(
      `
      id,
      initiator,
      message,
      created_at,
      parent_profile_id,
      parent_email,
      student_profile_id,
      student_email,
      parent:parent_profile_id (full_name, email),
      student:student_profile_id (full_name, email)
    `,
    )
    .eq("status", "requested")
    .eq("parent_profile_id", parentId);

  const allRequests = [...(requestRows ?? []), ...(emailRequests ?? [])];
  const seen = new Set<string>();
  const pendingIncoming: ParentLinkInvite[] = [];
  const pendingOutgoing: ParentLinkInvite[] = [];

  for (const row of allRequests) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const student = (
      Array.isArray(row.student) ? row.student[0] : row.student
    ) as { full_name: string; email: string } | null;
    const isOutgoing =
      row.initiator === "parent" && row.parent_profile_id === parentId;
    const invite: ParentLinkInvite = {
      id: row.id,
      initiator: row.initiator,
      message: row.message,
      createdAt: row.created_at,
      counterpartName: student?.full_name?.trim() || "Student",
      counterpartEmail: student?.email ?? row.student_email,
    };
    if (isOutgoing) pendingOutgoing.push(invite);
    else pendingIncoming.push(invite);
  }

  let upcomingSessions: UpcomingSession[] = [];
  let myClasses: EnrolledClass[] = [];

  if (selectedChildId) {
    const { data: enrollments } = await supabase
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
      .eq("student_profile_id", selectedChildId);

    myClasses = (enrollments ?? [])
      .map((row) => {
        const cls = (
          Array.isArray(row.classes) ? row.classes[0] : row.classes
        ) as {
          id: string;
          title: string;
          skill: string | null;
          status: string;
          is_home_studio: boolean | null;
          location_type: string | null;
          location_note: string | null;
          organizations: { name: string } | { name: string }[] | null;
          teachers:
            | { profiles: { full_name: string | null } | null }
            | { profiles: { full_name: string | null } | null }[]
            | null;
        } | null;
        if (!cls) return null;
        const org = Array.isArray(cls.organizations)
          ? cls.organizations[0]
          : cls.organizations;
        const teacher = Array.isArray(cls.teachers)
          ? cls.teachers[0]
          : cls.teachers;
        const teacherProfile = Array.isArray(teacher?.profiles)
          ? teacher?.profiles[0]
          : teacher?.profiles;
        const mapped: EnrolledClass = {
          id: cls.id,
          title: cls.title,
          skill: cls.skill,
          status: cls.status,
          orgName: org?.name ?? null,
          teacherName: teacherProfile?.full_name?.trim() || null,
          locationLabel: formatLocationType(cls.location_type),
          locationNote: cls.location_note,
          isHomeStudio: !!cls.is_home_studio,
          source: row.source,
          canLeave: false,
          nextMeetingAt: null,
          nextMeetingNote: null,
        };
        return mapped;
      })
      .filter((row): row is EnrolledClass => row !== null);

    const classIds = myClasses.map((c) => c.id);
    if (classIds.length > 0) {
      const { data: sessions } = await supabase
        .from("class_sessions")
        .select(
          `
          id,
          starts_at,
          ends_at,
          status,
          class_id,
          classes (id, title, skill, organizations (name))
        `,
        )
        .in("class_id", classIds)
        .in("status", ["scheduled", "postponed"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(20);

      upcomingSessions = (sessions ?? []).map((session) => {
        const cls = (
          Array.isArray(session.classes) ? session.classes[0] : session.classes
        ) as {
          id: string;
          title: string;
          skill: string | null;
          organizations: { name: string } | { name: string }[] | null;
        } | null;
        const org = Array.isArray(cls?.organizations)
          ? cls?.organizations[0]
          : cls?.organizations;
        return {
          id: session.id,
          classId: session.class_id,
          classTitle: cls?.title ?? "Class",
          orgName: org?.name ?? null,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          status: session.status,
          location: null,
        } satisfies UpcomingSession;
      });
    }
  }

  return {
    children,
    selectedChildId,
    pendingIncoming,
    pendingOutgoing,
    upcomingSessions,
    myClasses,
  };
}
