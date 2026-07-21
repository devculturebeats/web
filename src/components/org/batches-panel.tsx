"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { createBatch } from "@/lib/org-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Batch } from "@/types/database";

const batchSchema = z.object({
  name: z.string().min(1, "Batch name is required"),
  description: z.string().optional(),
});

type BatchFormValues = z.infer<typeof batchSchema>;

export function BatchesPanel({
  batches,
  disabled,
}: {
  batches: Batch[];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = (values: BatchFormValues) => {
    const formData = new FormData();
    formData.set("name", values.name);
    if (values.description) formData.set("description", values.description);

    startTransition(async () => {
      const result = await createBatch(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Batch created.");
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
        <h3 className="font-medium">Create batch</h3>
        <div className="space-y-2">
          <Label htmlFor="batch_name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input id="batch_name" placeholder="e.g. Grade 5 Dance" {...register("name")} />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="batch_description">Description</Label>
          <Textarea
            id="batch_description"
            placeholder="Optional details"
            rows={2}
            {...register("description")}
          />
        </div>
        <Button type="submit" size="sm" disabled={disabled || isPending}>
          {isPending ? "Creating..." : "Add batch"}
        </Button>
        </fieldset>
      </form>

      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No batches yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {batches.map((batch) => (
            <li key={batch.id} className="px-4 py-3">
              <p className="font-medium">{batch.name}</p>
              {batch.description && (
                <p className="mt-1 text-sm text-muted-foreground">{batch.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
