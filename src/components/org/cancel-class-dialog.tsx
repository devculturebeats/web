"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CancelClassDialogProps = {
  classTitle: string;
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<{ error?: string } | void>;
};

export function CancelClassDialog({
  classTitle,
  disabled,
  onConfirm,
}: CancelClassDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onConfirm(reason);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Class cancelled");
      setReason("");
      setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={disabled || isPending}
          />
        }
      >
        Cancel class
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {classTitle}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cancels open sessions and removes pending work for this class.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cancel-reason-${classTitle}`}>
            Reason (optional)
          </Label>
          <Textarea
            id={`cancel-reason-${classTitle}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Let people know why…"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep class</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={handleConfirm}
          >
            Cancel class
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
