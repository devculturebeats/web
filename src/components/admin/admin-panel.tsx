"use client";

import { useTransition } from "react";
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
    | { primary_skill: string | null; city: string | null }
    | { primary_skill: string | null; city: string | null }[]
    | null;
};

type PendingOrg = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
};

export function AdminPanel({
  pendingTeachers,
  pendingOrgs,
}: {
  pendingTeachers: PendingTeacher[];
  pendingOrgs: PendingOrg[];
}) {
  const [isPending, startTransition] = useTransition();

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
        <h2 className="font-heading text-lg font-semibold">
          Pending teachers ({pendingTeachers.length})
        </h2>
        <Separator className="my-4" />

        {pendingTeachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teachers awaiting approval.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingTeachers.map((teacher) => {
              const teacherData = Array.isArray(teacher.teachers)
                ? teacher.teachers[0]
                : teacher.teachers;

              return (
                <Card key={teacher.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {teacher.full_name || "Unnamed"}
                        </CardTitle>
                        <CardDescription>{teacher.email}</CardDescription>
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
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold">
          Pending organizations ({pendingOrgs.length})
        </h2>
        <Separator className="my-4" />

        {pendingOrgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No organizations awaiting approval.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingOrgs.map((org) => (
              <Card key={org.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{org.name}</CardTitle>
                      <CardDescription className="capitalize">
                        {org.type}
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
      </section>
    </div>
  );
}
