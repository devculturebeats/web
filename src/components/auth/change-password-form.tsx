"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm your new password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((values) => values.currentPassword !== values.password, {
    message: "New password must be different from the current one",
    path: ["password"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      toast.error("You need to be signed in to change your password.");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: values.currentPassword,
    });

    if (verifyError) {
      toast.error("Current password is incorrect.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated.");
    reset();
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
