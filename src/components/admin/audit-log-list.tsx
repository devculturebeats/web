"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAuditAction,
  formatAuditActor,
  formatAuditDetails,
  formatAuditEntityType,
  type AuditLogWithActor,
} from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";

type AuditLogListProps = {
  logs: AuditLogWithActor[];
  showActionFilter?: boolean;
  showOrganization?: boolean;
  emptyMessage?: string;
};

export function AuditLogList({
  logs,
  showActionFilter = false,
  showOrganization = false,
  emptyMessage = "No activity recorded yet.",
}: AuditLogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actionFilter, setActionFilter] = useState(
    searchParams.get("action") ?? "",
  );
  const [isPending, startTransition] = useTransition();

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = actionFilter.trim();
    if (trimmed) {
      params.set("action", trimmed);
    } else {
      params.delete("action");
    }
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  };

  return (
    <div className="space-y-4">
      {showActionFilter && (
        <form
          onSubmit={handleFilterSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-2">
            <Label htmlFor="audit-action-filter">Filter by action</Label>
            <Input
              id="audit-action-filter"
              placeholder="e.g. enrollment, cancel"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Filtering..." : "Apply"}
          </Button>
        </form>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              {showOrganization && <TableHead>Organization</TableHead>}
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const details = formatAuditDetails(log.action, log.metadata);

              return (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatAuditAction(log.action)}
                  </TableCell>
                  <TableCell>{formatAuditActor(log.actor)}</TableCell>
                  {showOrganization && (
                    <TableCell className="text-muted-foreground">
                      {log.organization?.name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="capitalize text-muted-foreground">
                    {formatAuditEntityType(log.entity_type)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {details ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
