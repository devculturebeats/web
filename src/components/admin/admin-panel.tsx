"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  updateOrgApproval,
  updateTeacherApproval,
} from "@/app/(app)/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginatedList } from "@/components/ui/client-pagination";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { ApprovalStatus } from "@/types/database";

type PendingTeacher = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
  teachers:
    | {
        primary_skill: string | null;
        city: string | null;
        lookup_code: string;
      }
    | {
        primary_skill: string | null;
        city: string | null;
        lookup_code: string;
      }[]
    | null;
};

type PendingOrg = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  lookup_code: string;
  approval_status: ApprovalStatus;
  created_at: string;
};

function teacherLookupCode(teacher: PendingTeacher): string {
  const data = Array.isArray(teacher.teachers)
    ? teacher.teachers[0]
    : teacher.teachers;
  return data?.lookup_code ?? "";
}

export function AdminPanel({
  pendingTeachers,
  pendingOrgs,
}: {
  pendingTeachers: PendingTeacher[];
  pendingOrgs: PendingOrg[];
}) {
  const [isPending, startTransition] = useTransition();
  const [teacherQuery, setTeacherQuery] = useState("");
  const [orgQuery, setOrgQuery] = useState("");

  const filteredTeachers = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    if (!q) return pendingTeachers;
    return pendingTeachers.filter((teacher) => {
      const code = teacherLookupCode(teacher).toLowerCase();
      return (
        code === q ||
        teacher.email.toLowerCase().includes(q) ||
        teacher.full_name.toLowerCase().includes(q) ||
        (teacher.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [pendingTeachers, teacherQuery]);

  const filteredOrgs = useMemo(() => {
    const q = orgQuery.trim().toLowerCase();
    if (!q) return pendingOrgs;
    return pendingOrgs.filter((org) => {
      return (
        org.lookup_code.toLowerCase() === q ||
        org.name.toLowerCase().includes(q) ||
        org.type.toLowerCase().includes(q) ||
        (org.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [pendingOrgs, orgQuery]);

  const handleTeacherAction = (profileId: string, status: ApprovalStatus) => {
    startTransition(async () => {
      const result = await updateTeacherApproval(profileId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Teacher ${status}.`);
    });
  };

  const handleOrgAction = (orgId: string, status: ApprovalStatus) => {
    startTransition(async () => {
      const result = await updateOrgApproval(orgId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Organization ${status}.`);
    });
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">
            Pending teachers ({filteredTeachers.length}
            {teacherQuery ? ` of ${pendingTeachers.length}` : ""})
          </h2>
          <Input
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            placeholder="Search by teacher ID, email, or name"
            className="max-w-sm"
          />
        </div>
        <Separator className="my-4" />

        {filteredTeachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {teacherQuery
              ? "No pending teachers match that search."
              : "No teachers awaiting approval."}
          </p>
        ) : (
          <PaginatedList items={filteredTeachers} pageSize={15} label="teachers">
            {(pageItems) => (
              <div className="space-y-3">
                {pageItems.map((teacher) => {
                  const teacherData = Array.isArray(teacher.teachers)
                    ? teacher.teachers[0]
                    : teacher.teachers;
                  const code = teacherData?.lookup_code;

                  return (
                    <Card key={teacher.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">
                              {teacher.full_name || "Unnamed"}
                            </CardTitle>
                            <CardDescription>
                              {code ? `ID ${code} · ` : ""}
                              {teacher.email}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary">Pending</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          {teacherData?.primary_skill && (
                            <span>{teacherData.primary_skill}</span>
                          )}
                          {teacherData?.city && <span>· {teacherData.city}</span>}
                          {teacher.phone && <span>· {teacher.phone}</span>}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              handleTeacherAction(teacher.id, "approved")
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={() =>
                              handleTeacherAction(teacher.id, "rejected")
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </PaginatedList>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">
            Pending organizations ({filteredOrgs.length}
            {orgQuery ? ` of ${pendingOrgs.length}` : ""})
          </h2>
          <Input
            value={orgQuery}
            onChange={(e) => setOrgQuery(e.target.value)}
            placeholder="Search by academy/school ID or name"
            className="max-w-sm"
          />
        </div>
        <Separator className="my-4" />

        {filteredOrgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {orgQuery
              ? "No pending organizations match that search."
              : "No organizations awaiting approval."}
          </p>
        ) : (
          <PaginatedList items={filteredOrgs} pageSize={15} label="organizations">
            {(pageItems) => (
              <div className="space-y-3">
                {pageItems.map((org) => (
                  <Card key={org.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{org.name}</CardTitle>
                          <CardDescription className="capitalize">
                            ID {org.lookup_code} · {org.type}
                            {org.city ? ` · ${org.city}` : ""}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">Pending</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleOrgAction(org.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => handleOrgAction(org.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </PaginatedList>
        )}
      </section>
    </div>
  );
}
