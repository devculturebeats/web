"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { markAllUnreadNotificationsRead } from "@/app/(app)/student/actions";
import {
  formatEnrollmentSource,
  JoinOrgButton,
  LeaveClassButton,
  OnboardingForm,
} from "@/components/student/student-action-buttons";
import type {
  EnrolledClass,
  JoinableOrg,
  LinkedInstitution,
  StudentNotification,
  UpcomingSession,
} from "@/components/student/types";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/lib/dates";

type StudentHomeProps = {
  needsProfile: boolean;
  joinableOrgs: JoinableOrg[];
  linkedInstitutions: LinkedInstitution[];
  myClasses: EnrolledClass[];
  upcomingSessions: UpcomingSession[];
  notifications: StudentNotification[];
};

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
  myClasses,
  upcomingSessions,
  notifications,
}: StudentHomeProps) {
  const initialUnread = notifications.filter((item) => !item.readAt).length;
  const [showUnreadBanner, setShowUnreadBanner] = useState(initialUnread > 0);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const updatesRef = useRef<HTMLElement | null>(null);
  const markedRef = useRef(false);

  const nextSession = upcomingSessions[0] ?? null;

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
        {nextSession ? (
          <Card className="border-primary/25">
            <CardContent className="space-y-1.5">
              <p className="font-heading text-xl font-semibold">
                <Link
                  href={`/classes/${nextSession.classId}`}
                  className="hover:underline"
                >
                  {nextSession.classTitle}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(nextSession.startsAt)}
              </p>
              {nextSession.orgName && (
                <p className="text-xs text-muted-foreground">
                  {nextSession.orgName}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled yet.{" "}
            <Link
              href="/student/browse"
              className="underline underline-offset-2"
            >
              Browse open classes
            </Link>{" "}
            or join your school below.
          </p>
        )}

        {upcomingSessions.length > 1 && (
          <div className="grid gap-2">
            {upcomingSessions.slice(1).map((session) => (
              <div key={session.id} className="rounded-lg border px-3 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <Link
                      href={`/classes/${session.classId}`}
                      className="hover:underline"
                    >
                      {session.classTitle}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(session.startsAt)}
                  </p>
                  {session.orgName && (
                    <p className="text-xs text-muted-foreground">
                      {session.orgName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">My classes</h2>
          <p className="text-sm text-muted-foreground">
            Courses you&apos;re enrolled in. Open one for full details — Next up
            shows only meetings that have a date on the calendar.
          </p>
        </div>
        {myClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No classes yet.{" "}
            <Link
              href="/student/browse"
              className="underline underline-offset-2"
            >
              Browse classes
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-3">
            {myClasses.map((cls) => {
              const place =
                [cls.locationLabel, cls.locationNote]
                  .filter(Boolean)
                  .join(" · ") || null;

              return (
                <Card key={cls.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-medium">
                        <Link
                          href={`/classes/${cls.id}`}
                          className="hover:underline"
                        >
                          {cls.title}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {cls.isHomeStudio
                          ? cls.teacherName
                            ? `Home studio · ${cls.teacherName}`
                            : "Home studio"
                          : (cls.orgName ?? "Independent")}
                        {cls.skill ? ` · ${cls.skill}` : ""}
                      </p>
                      {place && (
                        <p className="text-sm text-muted-foreground">
                          Place: {place}
                        </p>
                      )}
                      {cls.nextMeetingAt ? (
                        <p className="text-sm text-muted-foreground">
                          Next meeting: {formatDateTime(cls.nextMeetingAt)}
                        </p>
                      ) : cls.nextMeetingNote ? (
                        <p className="text-sm text-muted-foreground">
                          {cls.nextMeetingNote}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {cls.isHomeStudio
                          ? "Home studio"
                          : formatEnrollmentSource(cls.source)}
                      </Badge>
                      <LifecycleBadge status={cls.status} />
                      {cls.canLeave && <LeaveClassButton classId={cls.id} />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
        {linkedInstitutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None linked yet. Use Join school or academy to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {linkedInstitutions.map((link) => (
              <Card key={link.id}>
                <CardContent className="space-y-1.5">
                  <p className="font-medium">{link.orgName}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {link.orgType}
                    {link.batchName ? ` · ${link.batchName}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {notifications.length > 0 && (
        <section ref={updatesRef} id="updates" className="scroll-mt-20 space-y-3">
          <h2 className="font-heading text-lg font-semibold">Updates</h2>
          <div className="grid gap-3">
            {notifications.slice(0, 5).map((notification) => (
              <Card
                key={notification.recipientId}
                className={
                  notification.readAt || unreadCount === 0
                    ? undefined
                    : "border-primary/30"
                }
              >
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{notification.title}</p>
                      {notification.orgName && (
                        <p className="text-xs text-muted-foreground">
                          {notification.orgName}
                        </p>
                      )}
                    </div>
                    {!notification.readAt && unreadCount > 0 && (
                      <Badge variant="secondary">New</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {notification.body}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
