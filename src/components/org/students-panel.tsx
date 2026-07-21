"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { linkStudent } from "@/lib/org-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Batch } from "@/types/database";

const linkSchema = z.object({
  email: z.string().email("Enter a valid student email"),
  batch_id: z.string().optional(),
});

type LinkFormValues = z.infer<typeof linkSchema>;

export type LinkedStudent = {
  id: string;
  student_profile_id: string;
  batch_id: string | null;
  created_at: string;
  student: {
    full_name: string;
    email: string;
  } | null;
  batch: { name: string } | null;
};

export function StudentsPanel({
  students,
  batches,
  disabled,
}: {
  students: LinkedStudent[];
  batches: Batch[];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: { email: "", batch_id: "" },
  });

  const batchId = watch("batch_id");

  const onSubmit = (values: LinkFormValues) => {
    const formData = new FormData();
    formData.set("email", values.email);
    if (values.batch_id) formData.set("batch_id", values.batch_id);

    startTransition(async () => {
      const result = await linkStudent(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Student linked.");
      reset();
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-lg border p-4"
      >
        <fieldset disabled={disabled || isPending} className="space-y-4">
        <h3 className="font-medium">Link student</h3>
        <div className="space-y-2">
          <Label htmlFor="student_email">
            Student email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="student_email"
            type="email"
            placeholder="student@example.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        {batches.length > 0 && (
          <div className="space-y-2">
            <Label>Batch (optional)</Label>
            <Select
              value={batchId || "none"}
              onValueChange={(v) =>
                setValue("batch_id", v === "none" || v == null ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No batch</SelectItem>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="submit" size="sm" disabled={disabled || isPending}>
          {isPending ? "Linking..." : "Link student"}
        </Button>
        </fieldset>
      </form>

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked students yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {students.map((link) => (
            <li key={link.id} className="px-4 py-3">
              <p className="font-medium">
                {link.student?.full_name || "Unknown student"}
              </p>
              <p className="text-sm text-muted-foreground">{link.student?.email}</p>
              {link.batch && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Batch: {link.batch.name}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
