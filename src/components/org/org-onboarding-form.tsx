"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { completeOrgOnboarding } from "@/app/(app)/onboarding/organization/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_CITIES, SERVICE_CITY_VALUES } from "@/lib/locations";
import type { CurrentProfile } from "@/lib/profiles";

const orgFormSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  city: z.union([z.enum(SERVICE_CITY_VALUES), z.literal("")]).optional(),
  area: z.string().optional(),
  description: z.string().optional(),
});

type OrgFormValues = z.infer<typeof orgFormSchema>;

type OrgOnboardingFormProps = {
  profile: CurrentProfile;
  orgLabel: string;
};

export function OrgOnboardingForm({ profile, orgLabel }: OrgOnboardingFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: {
      name: "",
      city: "",
      area: "",
      description: "",
    },
  });

  const onSubmit = (values: OrgFormValues) => {
    const formData = new FormData();
    formData.set("name", values.name);
    if (values.city) formData.set("city", values.city);
    if (values.area) formData.set("area", values.area);
    if (values.description) formData.set("description", values.description);

    startTransition(async () => {
      const result = await completeOrgOnboarding(formData);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={profile.email} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="org_type">Organization type</Label>
        <Input id="org_type" value={orgLabel} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">
          {orgLabel} name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder={`Your ${orgLabel.toLowerCase()} name`}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>City</Label>
          <Controller
            name="city"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CITIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="area">Area</Label>
          <Input
            id="area"
            placeholder="Neighborhood or locality"
            {...register("area")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Tell us about your organization"
          rows={4}
          {...register("description")}
        />
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? "Creating..." : `Create ${orgLabel.toLowerCase()}`}
      </Button>
    </form>
  );
}
