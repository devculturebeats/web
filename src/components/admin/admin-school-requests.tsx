"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  assignTeacherToSchoolNeed,
  matchTeachersForSchoolNeed,
  searchTeachersByName,
} from "@/app/(app)/admin/requests/actions";
import { Button } from "@/components/ui/button";
import { PaginatedList } from "@/components/ui/client-pagination";
import { Input } from "@/components/ui/input";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { slotsFromProposed } from "@/lib/week-slots";
import type { TeacherMatch } from "@/types/database";

export type SchoolNeedRow = {
  id: string;
  title: string;
  skill: string | null;
  description: string | null;
  created_at: string;
  proposed_slots: unknown;
  proposed_day_of_week: number | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  organization: { id: string; name: string; city: string | null };
  kind: "need" | "rematch";
  currentTeacherName?: string | null;
};

export function AdminSchoolRequests({ needs }: { needs: SchoolNeedRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [matches, setMatches] = useState<TeacherMatch[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; full_name: string; primary_skill: string | null }[]
  >([]);
  const [forceTeacherId, setForceTeacherId] = useState<string | null>(null);

  const loadMatches = (classId: string) => {
    setActiveId(classId);
    setMatches([]);
    setSearchResults([]);
    setForceTeacherId(null);
    startTransition(async () => {
      const result = await matchTeachersForSchoolNeed(classId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setMatches(result.matches ?? []);
    });
  };

  const runSearch = () => {
    startTransition(async () => {
      const result = await searchTeachersByName(search);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSearchResults(result.teachers ?? []);
    });
  };

  const sendRequest = (
    classId: string,
    teacherId: string,
    force: boolean,
    replacement: boolean,
  ) => {
    startTransition(async () => {
      const result = await assignTeacherToSchoolNeed(classId, teacherId, {
        force,
        replacement,
      });
      if (result.error) {
        if (result.warning && !force) {
          setForceTeacherId(teacherId);
          toast.error(result.error);
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success(
        force
          ? "Force request sent to the teacher."
          : replacement
            ? "Replacement request sent to the teacher."
            : "Request sent to the teacher.",
      );
      setForceTeacherId(null);
      setMatches([]);
      setActiveId(null);
    });
  };

  if (needs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open school teacher requests or rematches right now.
      </p>
    );
  }

  return (
    <PaginatedList items={needs} pageSize={10} label="requests">
      {(pageItems) => (
        <ul className="space-y-6">
          {pageItems.map((need) => {
            const slots = slotsFromProposed(need) ?? [];
            const slotLabel = slots
              .map((slot) => {
                const day =
                  DAYS_OF_WEEK.find((d) => d.value === slot.day)?.label ??
                  `Day ${slot.day}`;
                return `${day} ${formatTime(slot.start.slice(0, 5))}–${formatTime(slot.end.slice(0, 5))}`;
              })
              .join(" · ");

            const isActive = activeId === need.id;
            const isRematch = need.kind === "rematch";

            return (
              <li
                key={need.id}
                className="space-y-3 border-b border-border/60 pb-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {need.title}
                      {isRematch ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Rematch
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {need.organization.name}
                      {need.organization.city
                        ? ` · ${need.organization.city}`
                        : ""}
                      {need.skill ? ` · ${need.skill}` : ""}
                    </p>
                    {isRematch && need.currentTeacherName ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Current teacher: {need.currentTeacherName}
                      </p>
                    ) : null}
                    {slotLabel ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {slotLabel}
                      </p>
                    ) : null}
                    {need.description ? (
                      <p className="mt-1 text-sm">{need.description}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "secondary" : "outline"}
                    disabled={isPending}
                    onClick={() => loadMatches(need.id)}
                  >
                    {isActive
                      ? "Matching…"
                      : isRematch
                        ? "Find replacement"
                        : "Find available teachers"}
                  </Button>
                </div>

                {isActive && (
                  <div className="space-y-4 rounded-xl bg-muted/40 p-4">
                    <div>
                      <p className="text-sm font-medium">Available matches</p>
                      {matches.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          No teachers free for every requested slot. Search by
                          name to force a request.
                        </p>
                      ) : (
                        <PaginatedList
                          items={matches}
                          pageSize={10}
                          label="teachers"
                        >
                          {(pageItems) => (
                            <ul className="mt-2 space-y-2">
                              {pageItems.map((match) => (
                                <li
                                  key={match.teacher_id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                >
                                  <span>
                                    {match.full_name}
                                    {match.primary_skill
                                      ? ` · ${match.primary_skill}`
                                      : ""}
                                    {match.city ? ` · ${match.city}` : ""}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() =>
                                      sendRequest(
                                        need.id,
                                        match.teacher_id,
                                        false,
                                        isRematch,
                                      )
                                    }
                                  >
                                    {isRematch
                                      ? "Send rematch"
                                      : "Send request"}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </PaginatedList>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Search teacher by name
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Teacher name"
                          className="max-w-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={runSearch}
                        >
                          Search
                        </Button>
                      </div>
                      {searchResults.length > 0 && (
                        <ul className="space-y-2">
                          {searchResults.map((teacher) => (
                            <li
                              key={teacher.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                              <span>
                                {teacher.full_name}
                                {teacher.primary_skill
                                  ? ` · ${teacher.primary_skill}`
                                  : ""}
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() =>
                                    sendRequest(
                                      need.id,
                                      teacher.id,
                                      false,
                                      isRematch,
                                    )
                                  }
                                >
                                  Request
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    forceTeacherId === teacher.id
                                      ? "default"
                                      : "ghost"
                                  }
                                  disabled={isPending}
                                  onClick={() => {
                                    if (forceTeacherId === teacher.id) {
                                      sendRequest(
                                        need.id,
                                        teacher.id,
                                        true,
                                        isRematch,
                                      );
                                    } else {
                                      setForceTeacherId(teacher.id);
                                      toast.message(
                                        "Force request ignores availability. Click again to confirm.",
                                      );
                                    }
                                  }}
                                >
                                  {forceTeacherId === teacher.id
                                    ? "Confirm force"
                                    : "Force request"}
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PaginatedList>
  );
}
