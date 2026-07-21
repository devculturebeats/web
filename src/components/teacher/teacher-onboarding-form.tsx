"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  completeTeacherOnboarding,
  updateTeacherProfile,
} from "@/app/(app)/onboarding/teacher/actions";
import {
  PlaceAutocomplete,
  type SelectedPlace,
} from "@/components/location/place-autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ART_SKILLS } from "@/lib/constants";
import { SERVICE_CITIES, SERVICE_CITY_VALUES } from "@/lib/locations";
import type { CurrentProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

const INDIA_PHONE_REGEX = /^\d{10}$/;

function toLocalPhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

function toE164India(localDigits: string): string {
  return `+91${localDigits}`;
}

function IndiaPhoneField({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (localDigits: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid &&
          "border-destructive ring-3 ring-destructive/20 aria-invalid:border-destructive",
      )}
    >
      <span className="shrink-0 border-r border-input px-3 text-sm text-muted-foreground">
        +91
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        aria-invalid={invalid}
        disabled={disabled}
        className="border-0 shadow-none focus-visible:ring-0"
        value={value}
        onChange={(e) => onChange(toLocalPhoneDigits(e.target.value))}
      />
    </div>
  );
}

const teacherFormSchema = z
  .object({
    full_name: z.string().min(1, "Full name is required"),
    phone: z
      .string()
      .regex(INDIA_PHONE_REGEX, "Enter a valid 10-digit phone number"),
    whatsapp_same: z.boolean(),
    whatsapp: z.string().optional(),
    primary_skill: z.string().min(1, "Primary skill is required"),
    secondary_skills: z.array(z.string()),
    years_of_experience: z.string().optional(),
    bio: z.string().optional(),
    qualifications: z.string().optional(),
    residential_address: z
      .string()
      .min(8, "Enter your complete residential address"),
    teaching_city: z.enum(SERVICE_CITY_VALUES, {
      message: "Select Mangalore or Udupi",
    }),
  })
  .superRefine((values, ctx) => {
    if (!values.whatsapp_same) {
      if (!values.whatsapp || !INDIA_PHONE_REGEX.test(values.whatsapp)) {
        ctx.addIssue({
          code: "custom",
          path: ["whatsapp"],
          message: "Enter a valid 10-digit WhatsApp number",
        });
      }
    }
  });

type TeacherFormValues = z.infer<typeof teacherFormSchema>;

type TeacherOnboardingFormProps = {
  profile: CurrentProfile;
  mode?: "onboarding" | "edit";
};

function asServiceCity(
  value: string | null | undefined,
): (typeof SERVICE_CITY_VALUES)[number] | undefined {
  if (
    value &&
    SERVICE_CITY_VALUES.includes(
      value as (typeof SERVICE_CITY_VALUES)[number],
    )
  ) {
    return value as (typeof SERVICE_CITY_VALUES)[number];
  }
  return undefined;
}

function initialPlace(teacher: CurrentProfile["teacher"]): SelectedPlace | null {
  if (
    !teacher?.place_id ||
    teacher.latitude == null ||
    teacher.longitude == null ||
    !teacher.area
  ) {
    return null;
  }
  return {
    placeId: teacher.place_id,
    label: teacher.area,
    latitude: teacher.latitude,
    longitude: teacher.longitude,
  };
}

export function TeacherOnboardingForm({
  profile,
  mode = "onboarding",
}: TeacherOnboardingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const teacher = profile.teacher;

  const teachingDefault = asServiceCity(teacher?.city);

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(
    () => initialPlace(teacher),
  );
  const [fallbackArea, setFallbackArea] = useState(teacher?.area || "");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      full_name: profile.full_name || "",
      phone: toLocalPhoneDigits(profile.phone),
      whatsapp_same: true,
      whatsapp: toLocalPhoneDigits(
        profile.whatsapp && profile.whatsapp !== profile.phone
          ? profile.whatsapp
          : "",
      ),
      primary_skill: teacher?.primary_skill || "",
      secondary_skills: teacher?.secondary_skills || [],
      years_of_experience: teacher?.years_of_experience?.toString() || "",
      bio: teacher?.bio || "",
      qualifications: teacher?.qualifications || "",
      residential_address: teacher?.residential_address || "",
      teaching_city: teachingDefault,
    },
  });

  const whatsappSame = watch("whatsapp_same") !== false;
  const teachingCity = watch("teaching_city");

  const onSubmit = (values: TeacherFormValues) => {
    const area = selectedPlace?.label?.trim() || fallbackArea.trim();
    if (!area) {
      toast.error(
        "Pick a teaching locality so students can find teachers near them.",
      );
      return;
    }

    const formData = new FormData();
    formData.set("full_name", values.full_name);
    formData.set("phone", toE164India(values.phone));
    formData.set("whatsapp_same", String(values.whatsapp_same));
    if (!values.whatsapp_same && values.whatsapp) {
      formData.set("whatsapp", toE164India(values.whatsapp));
    }
    formData.set("primary_skill", values.primary_skill);
    values.secondary_skills.forEach((skill) =>
      formData.append("secondary_skills", skill),
    );
    if (values.years_of_experience) {
      formData.set("years_of_experience", values.years_of_experience);
    }
    if (values.bio) formData.set("bio", values.bio);
    if (values.qualifications) {
      formData.set("qualifications", values.qualifications);
    }
    formData.set("residential_address", values.residential_address);
    formData.set("teaching_city", values.teaching_city);
    formData.set("area", area);
    if (selectedPlace) {
      formData.set("place_id", selectedPlace.placeId);
      formData.set("latitude", String(selectedPlace.latitude));
      formData.set("longitude", String(selectedPlace.longitude));
    }
    if (avatarFile) formData.set("avatar", avatarFile);
    if (certificateFile) formData.set("certificate", certificateFile);
    if (resumeFile) formData.set("resume", resumeFile);

    startTransition(async () => {
      const action =
        mode === "onboarding"
          ? completeTeacherOnboarding
          : updateTeacherProfile;
      const result = await action(formData);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        mode === "onboarding"
          ? "Profile completed! Welcome to CultureBeats."
          : "Profile updated successfully.",
      );
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={profile.email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">
          Email cannot be changed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          aria-invalid={!!errors.full_name}
          {...register("full_name")}
        />
        {errors.full_name && (
          <p className="text-sm text-destructive">{errors.full_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <IndiaPhoneField
              id="phone"
              value={field.value}
              onChange={field.onChange}
              invalid={!!errors.phone}
              disabled={isPending}
            />
          )}
        />
        {errors.phone && (
          <p className="text-sm text-destructive">{errors.phone.message}</p>
        )}
        <Controller
          name="whatsapp_same"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
              <Checkbox
                checked={field.value !== false}
                onCheckedChange={(checked) => {
                  const same = checked === true;
                  field.onChange(same);
                  if (same) setValue("whatsapp", "");
                }}
              />
              <span>WhatsApp number is the same as phone</span>
            </label>
          )}
        />
      </div>

      {!whatsappSame && (
        <div className="space-y-2">
          <Label htmlFor="whatsapp">
            WhatsApp number <span className="text-destructive">*</span>
          </Label>
          <Controller
            name="whatsapp"
            control={control}
            render={({ field }) => (
              <IndiaPhoneField
                id="whatsapp"
                value={field.value || ""}
                onChange={field.onChange}
                invalid={!!errors.whatsapp}
                disabled={isPending}
              />
            )}
          />
          {errors.whatsapp && (
            <p className="text-sm text-destructive">{errors.whatsapp.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>
          Primary skill <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="primary_skill"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your primary art form" />
              </SelectTrigger>
              <SelectContent>
                {ART_SKILLS.map((skill) => (
                  <SelectItem key={skill} value={skill}>
                    {skill}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.primary_skill && (
          <p className="text-sm text-destructive">
            {errors.primary_skill.message}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Label>Secondary skills</Label>
        <Controller
          name="secondary_skills"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ART_SKILLS.filter((s) => s !== "Other").map((skill) => {
                const checked = field.value.includes(skill);
                return (
                  <label
                    key={skill}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(isChecked) => {
                        if (isChecked) {
                          field.onChange([...field.value, skill]);
                        } else {
                          field.onChange(
                            field.value.filter((s: string) => s !== skill),
                          );
                        }
                      }}
                    />
                    {skill}
                  </label>
                );
              })}
            </div>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="years_of_experience">Years of experience</Label>
        <Input
          id="years_of_experience"
          type="number"
          min={0}
          {...register("years_of_experience")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="residential_address">
          Complete residential address{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="residential_address"
          rows={3}
          placeholder="House / flat, street, city, landmark, pincode…"
          aria-invalid={!!errors.residential_address}
          {...register("residential_address")}
        />
        {errors.residential_address && (
          <p className="text-sm text-destructive">
            {errors.residential_address.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>
          Preferred teaching city <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="teaching_city"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next);
                setSelectedPlace(null);
                setFallbackArea("");
              }}
            >
              <SelectTrigger className="w-full sm:max-w-xs">
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
        {errors.teaching_city && (
          <p className="text-sm text-destructive">
            {errors.teaching_city.message}
          </p>
        )}
      </div>

      <PlaceAutocomplete
        city={teachingCity || ""}
        value={selectedPlace}
        onChange={setSelectedPlace}
        disabled={isPending}
        required
        label="Teaching locality"
        description="Students and schools will use this to find teachers nearest to their locality."
        fallbackArea={fallbackArea}
        onFallbackAreaChange={setFallbackArea}
      />

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          rows={3}
          placeholder="Tell schools about your teaching style and background…"
          {...register("bio")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="qualifications">Qualifications</Label>
        <Textarea
          id="qualifications"
          rows={2}
          placeholder="Degrees, certifications…"
          {...register("qualifications")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="avatar">Profile photo (optional)</Label>
          <Input
            id="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="certificate">Certificate (optional)</Label>
          <Input
            id="certificate"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="resume">Resume / CV (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Upload a PDF or document if you’d like schools to review your
          experience. You can skip this for now.
        </p>
        <Input
          id="resume"
          type="file"
          accept="application/pdf,.doc,.docx,image/jpeg,image/png"
          onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
        />
        {resumeFile && (
          <p className="text-xs text-muted-foreground">
            Selected: {resumeFile.name}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending
          ? "Saving…"
          : mode === "onboarding"
            ? "Complete profile"
            : "Save changes"}
      </Button>
    </form>
  );
}
