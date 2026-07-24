"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { markAllUnreadNotificationsRead } from "@/app/(app)/student/actions";
import {
  JoinOrgButton,
  OnboardingForm,
  RespondInstitutionInviteButtons,
} from "@/components/student/student-action-buttons";
import { StudentParentLinks } from "@/components/student/student-parent-links";
import type {
  InstitutionInvite,
  JoinableOrg,
  LinkedInstitution,
  StudentNotification,
  UpcomingSession,
} from "@/components/student/types";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type StudentHomeProps = {
  needsProfile: boolean;
  joinableOrgs: JoinableOrg[];
  linkedInstitutions: LinkedInstitution[];
  institutionInvites: InstitutionInvite[];
  upcomingSessions: UpcomingSession[];
  notifications: StudentNotification[];
  lookupCode?: string | null;
  parentInvitesIncoming?: {
    id: string;
    initiator: string;
    message: string | null;
    createdAt: string;
    counterpartName: string;
    counterpartEmail: string | null;
  }[];
  parentInvitesOutgoing?: {
    id: string;
    initiator: string;
    message: string | null;
    createdAt: string;
    counterpartName: string;
    counterpartEmail: string | null;
  }[];
};

function orgTypeLabel(type: string): string {
  if (type === "academy") return "academy";
  return "school";
}

const APP_TIME_ZONE = "Asia/Kolkata";

function dateKeyInAppTz(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayParts(iso: string): { weekday: string; day: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
  };
}

function sessionTime(iso: string): string {
  return formatDateTime(iso).split(" · ")[1] ?? "";
}

function JoinInstitutionPopover({
  joinableOrgs,
}: {
  joinableOrgs: JoinableOrg[];
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline" aria-label="Join a school or academy" />
        }
      >
        Join school or academy
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <PopoverHeader>
          <PopoverTitle>Join an institution</PopoverTitle>
          <PopoverDescription>
            Link your school or academy to get their assigned classes.
          </PopoverDescription>
        </PopoverHeader>
        {joinableOrgs.length === 0 ? (
          <p className="pt-2 text-sm text-muted-foreground">
            No new institutions available to join.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {joinableOrgs.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{org.name}</p>
                  <p className="truncate text-xs text-muted-foreground capitalize">
                    {org.type}
                    {org.city ? ` · ${org.city}` : ""}
                  </p>
                </div>
                <JoinOrgButton orgId={org.id} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function StudentHome({
  needsProfile,
  joinableOrgs,
  linkedInstitutions,
  institutionInvites,
  upcomingSessions,
  notifications,
  lookupCode = null,
  parentInvitesIncoming = [],
  parentInvitesOutgoing = [],
}: StudentHomeProps) {
  const initialUnread = notifications.filter((item) => !item.readAt).length;
  const [showUnreadBanner, setShowUnreadBanner] = useState(initialUnread > 0);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const updatesRef = useRef<HTMLElement | null>(null);
  const markedRef = useRef(false);

  const upcomingByDay = upcomingSessions.reduce<
    {
      key: string;
      weekday: string;
      day: string;
      month: string;
      items: UpcomingSession[];
    }[]
  >((groups, session) => {
    const key = dateKeyInAppTz(session.startsAt);
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.items.push(session);
    } else {
      const { weekday, day, month } = dayParts(session.startsAt);
      groups.push({ key, weekday, day, month, items: [session] });
    }
    return groups;
  }, []);

  const markUpdatesRead = () => {
    if (markedRef.current || unreadCount === 0) return;
    markedRef.current = true;
    setShowUnreadBanner(false);
    setUnreadCount(0);
    startTransition(async () => {
      await markAllUnreadNotificationsRead();
    });
  };

  useEffect(() => {
    const node = updatesRef.current;
    if (!node || unreadCount === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markUpdatesRead();
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark once when section enters view
  }, [unreadCount]);

  const scrollToUpdates = () => {
    updatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Mark after scroll starts; observer will also fire
    window.setTimeout(() => markUpdatesRead(), 400);
  };

  const unreadLabel =
    unreadCount === 1
      ? "1 new update — click to check"
      : `${unreadCount} new updates — click to check`;

  return (
    <div className="space-y-8">
      {needsProfile && <OnboardingForm />}

      <StudentParentLinks
        lookupCode={lookupCode}
        pendingIncoming={parentInvitesIncoming}
        pendingOutgoing={parentInvitesOutgoing}
      />

      {showUnreadBanner && (
        <button
          type="button"
          onClick={scrollToUpdates}
          className="w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {unreadLabel}
        </button>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Next up</h2>
          <p className="text-sm text-muted-foreground">
            Your next meeting times — when and where you need to show up.
          </p>
        </div>
        {upcomingByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled in the next 7 days.{" "}
            <Link
              href="/student/browse"
              className="underline underline-offset-2"
            >
              Browse open classes
            </Link>{" "}
            or join your school below.
          </p>
        ) : (
          <PaginatedList items={upcomingByDay} pageSize={5} label="days">
            {(pageItems) => (
              <div className="overflow-hidden rounded-xl border bg-card">
                {pageItems.map((group, index) => (
                  <div
                    key={group.key}
                    className={cn(
                      "grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5.5rem_1fr]",
                      index > 0 && "border-t",
                    )}
                  >
                    <div className="flex flex-col items-center justify-start border-r bg-muted/30 px-2 py-4 text-center">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.weekday}
                      </span>
                      <span className="font-heading text-2xl font-semibold tabular-nums leading-none tracking-tight">
                        {group.day}
                      </span>
                      <span className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                        {group.month}
                      </span>
                    </div>
                    <ul className="divide-y">
                      {group.items.map((session) => (
                        <li key={session.id} className="px-4 py-3">
                          <p className="font-medium leading-snug">
                            <Link
                              href={`/classes/${session.classId}`}
                              className="hover:underline"
                            >
                              {session.classTitle}
                            </Link>
                          </p>
                          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                            {sessionTime(session.startsAt)}
                          </p>
                          {(session.location || session.orgName) && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {session.location || session.orgName}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </PaginatedList>
        )}
      </section>

      {notifications.length > 0 && (
        <section
          ref={updatesRef}
          id="updates"
          className="scroll-mt-20 space-y-2"
        >
          <h2 className="font-heading text-lg font-semibold">Updates</h2>
          <ul className="space-y-2">
            {notifications.slice(0, 5).map((notification) => (
              <li
                key={notification.recipientId}
                className="flex gap-3 text-sm"
              >
                <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                  {formatDateTime(notification.createdAt).split(" · ")[0]}
                </span>
                <span className="min-w-0 text-foreground/90">
                  <span className="font-medium">{notification.title}</span>
                  {notification.body ? ` — ${notification.body}` : ""}
                  {!notification.readAt && unreadCount > 0 ? (
                    <span className="ml-1.5 text-xs font-medium text-primary">
                      New
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              My schools & academies
            </h2>
            <p className="text-sm text-muted-foreground">
              Institutions you&apos;re linked to.
            </p>
          </div>
          <JoinInstitutionPopover joinableOrgs={joinableOrgs} />
        </div>

        {institutionInvites.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Invites</h3>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {institutionInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{invite.orgName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Are you part of this {orgTypeLabel(invite.orgType)}
                      {invite.orgCity ? ` in ${invite.orgCity}` : ""}?
                      {invite.batchName ? ` · ${invite.batchName}` : ""}
                    </p>
                  </div>
                  <RespondInstitutionInviteButtons requestId={invite.id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {linkedInstitutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None linked yet. Accept an invite or use Join school or academy.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y">
              {linkedInstitutions.map((link) => (
                <li
                  key={link.id}
                  className="grid min-h-12 grid-cols-[4rem_1fr] items-center gap-4 px-4 py-2.5"
                >
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {link.orgType === "academy" ? "Academy" : "School"}
                  </span>
                  <p className="min-w-0 truncate text-sm leading-snug">
                    <span className="font-medium">{link.orgName}</span>
                    {link.batchName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {link.batchName}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
