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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

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
      toast.success("Notification sent.");
      reset();
      setSelectedClassIds([]);
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border p-4"
    >
      <h3 className="font-medium">Send notification</h3>
      <p className="text-sm text-muted-foreground">
        Notify enrolled students about schedule changes, events, or announcements.
      </p>

      <fieldset disabled={disabled || isPending} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="notify_title">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="notify_title"
            placeholder="e.g. Class cancelled tomorrow"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notify_body">
            Message <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="notify_body"
            placeholder="Write your message to students..."
            rows={4}
            {...register("body")}
          />
          {errors.body && (
            <p className="text-sm text-destructive">{errors.body.message}</p>
          )}
        </div>

        <div className="space-y-3">
          <Label>Audience</Label>
          <RadioGroup
            value={audience}
            onValueChange={(value) =>
              setValue("audience", value as "all" | "selected")
            }
            className="gap-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="all" />
              All enrolled students
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="selected" />
              Selected classes
            </label>
          </RadioGroup>
        </div>

        {audience === "selected" && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label>Select classes</Label>
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes available.</p>
            ) : (
              <ul className="space-y-2">
                {classes.map((cls) => (
                  <li key={cls.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`notify-class-${cls.id}`}
                      checked={selectedClassIds.includes(cls.id)}
                      onCheckedChange={(checked) =>
                        toggleClass(cls.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`notify-class-${cls.id}`}
                      className="cursor-pointer font-normal"
                    >
                      {cls.title}
                    </Label>
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

        <Button type="submit" disabled={disabled || isPending}>
          {isPending ? "Sending..." : "Send notification"}
        </Button>
      </fieldset>
    </form>
  );
}
