"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const notifySchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    body: z.string().min(1, "Message body is required"),
    audience: z.enum(["all", "selected"]),
    class_ids: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      data.audience === "all" ||
      (data.class_ids != null && data.class_ids.length > 0),
    {
      message: "Select at least one class",
      path: ["class_ids"],
    },
  );

type NotifyFormValues = z.infer<typeof notifySchema>;

export type NotifyClassOption = {
  id: string;
  title: string;
};

type NotifyPanelProps = {
  classes: NotifyClassOption[];
  disabled?: boolean;
  onSend: (
    title: string,
    body: string,
    classIds: string[] | null,
  ) => Promise<{ error?: string; success?: boolean }>;
};

export function NotifyPanel({ classes, disabled, onSend }: NotifyPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NotifyFormValues>({
    resolver: zodResolver(notifySchema),
    defaultValues: {
      title: "",
      body: "",
      audience: "all",
      class_ids: [],
    },
  });

  const audience = watch("audience");

  const toggleClass = (classId: string, checked: boolean) => {
    setSelectedClassIds((prev) => {
      const next = checked
        ? [...prev, classId]
        : prev.filter((id) => id !== classId);
      setValue("class_ids", next);
      return next;
    });
  };

  const onSubmit = (values: NotifyFormValues) => {
    const classIds =
      values.audience === "all" ? null : (values.class_ids ?? []);

    startTransition(async () => {
      const result = await onSend(values.title, values.body, classIds);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Sent to students.");
      reset();
      setSelectedClassIds([]);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-8">
      <fieldset disabled={disabled || isPending} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="notify_title">Subject</Label>
          <Input
            id="notify_title"
            placeholder="Class cancelled tomorrow"
            className="h-10"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notify_body">Message</Label>
          <Textarea
            id="notify_body"
            placeholder="A short note for your students…"
            rows={5}
            className="min-h-28 resize-y"
            {...register("body")}
          />
          {errors.body && (
            <p className="text-sm text-destructive">{errors.body.message}</p>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Who should get this?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => setValue("audience", "all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                audience === "all"
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-foreground hover:bg-muted",
              )}
            >
              Everyone enrolled
            </button>
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => setValue("audience", "selected")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                audience === "selected"
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-foreground hover:bg-muted",
              )}
            >
              Specific classes
            </button>
          </div>

          {audience === "selected" && (
            <div className="space-y-2 pt-1">
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No classes to choose from yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {classes.map((cls) => (
                    <li key={cls.id}>
                      <label
                        htmlFor={`notify-class-${cls.id}`}
                        className="flex cursor-pointer items-center gap-2.5 text-sm"
                      >
                        <Checkbox
                          id={`notify-class-${cls.id}`}
                          checked={selectedClassIds.includes(cls.id)}
                          onCheckedChange={(checked) =>
                            toggleClass(cls.id, checked === true)
                          }
                        />
                        <span>{cls.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {errors.class_ids && (
                <p className="text-sm text-destructive">
                  {errors.class_ids.message}
                </p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" disabled={disabled || isPending}>
          {isPending ? "Sending…" : "Send"}
        </Button>
      </fieldset>
    </form>
  );
}
