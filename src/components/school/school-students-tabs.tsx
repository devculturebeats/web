"use client";

import { BatchesPanel } from "@/components/org/batches-panel";
import {
  StudentsPanel,
  type LinkedStudent,
  type PendingStudentInvite,
} from "@/components/org/students-panel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Batch } from "@/types/database";

export function SchoolStudentsTabs({
  students,
  pendingInvites = [],
  batches,
  disabled,
  defaultTab = "students",
}: {
  students: LinkedStudent[];
  pendingInvites?: PendingStudentInvite[];
  batches: Batch[];
  disabled?: boolean;
  defaultTab?: "students" | "batches";
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList variant="line">
        <TabsTrigger value="students">All students</TabsTrigger>
        <TabsTrigger value="batches">Batches</TabsTrigger>
      </TabsList>

      <TabsContent value="students" className="mt-4">
        <StudentsPanel
          students={students}
          pendingInvites={pendingInvites}
          batches={batches}
          disabled={disabled}
        />
      </TabsContent>

      <TabsContent value="batches" className="mt-4">
        <BatchesPanel batches={batches} disabled={disabled} />
      </TabsContent>
    </Tabs>
  );
}
