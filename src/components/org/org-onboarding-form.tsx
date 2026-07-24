"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { completeOrgOnboarding } from "@/app/(app)/onboarding/organization/actions";
import { IndiaPhoneField } from "@/components/forms/india-phone-field";
import {
  PlaceAutocomplete,
  type SelectedPlace,
} from "@/components/location/place-autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { INDIA_PHONE_REGEX, toE164India, toLocalPhoneDigits } from "@/lib/phone";
import type { CurrentProfile } from "@/lib/profiles";

const orgFormSchema = z
  .object({
    org_type: z.enum(["school", "academy"], {
      message: "Select school or academy",
    }),
    name: z.string().min(1, "Institution name is required"),
    incharge_name: z.string().min(1, "Incharge name is required"),
    incharge_phone: z
      .string()
      .regex(INDIA_PHONE_REGEX, "Enter a valid 10-digit phone number"),
    incharge_whatsapp_same: z.boolean(),
    incharge_whatsapp: z.string().optional(),
    activities: z.array(z.string()),
    city: z.enum(SERVICE_CITY_VALUES, {
      message: "Select a city",
    }),
    contact_email: z.string().email("Enter a valid institution email"),
    contact_phone: z
      .string()
      .regex(INDIA_PHONE_REGEX, "Enter a valid 10-digit phone number"),
    contact_whatsapp_same: z.boolean(),
    contact_whatsapp: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.incharge_whatsapp_same) {
      if (
        !values.incharge_whatsapp ||
        !INDIA_PHONE_REGEX.test(values.incharge_whatsapp)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["incharge_whatsapp"],
          message: "Enter a valid 10-digit WhatsApp number",
        });
      }
    }
    if (!values.contact_whatsapp_same) {
      if (
        !values.contact_whatsapp ||
        !INDIA_PHONE_REGEX.test(values.contact_whatsapp)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["contact_whatsapp"],
          message: "Enter a valid 10-digit WhatsApp number",
        });
      }
    }
  });

type OrgFormValues = z.infer<typeof orgFormSchema>;

type OrgOnboardingFormProps = {
  profile: CurrentProfile;
};

export function OrgOnboardingForm({ profile }: OrgOnboardingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(
    null,
  );
  const [fallbackArea, setFallbackArea] = useState("");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: {
      org_type: undefined,
      name: "",
      incharge_name: profile.full_name || "",
      incharge_phone: toLocalPhoneDigits(profile.phone),
      incharge_whatsapp_same: true,
      incharge_whatsapp: "",
      activities: [],
      city: undefined,
      contact_email: profile.email || "",
      contact_phone: toLocalPhoneDigits(profile.phone),
      contact_whatsapp_same: true,
      contact_whatsapp: "",
      description: "",
    },
  });

  const orgType = watch("org_type");
  const orgLabel =
    orgType === "academy" ? "Academy" : orgType === "school" ? "School" : "Institution";
  const inchargeWhatsappSame = watch("incharge_whatsapp_same") !== false;
  const contactWhatsappSame = watch("contact_whatsapp_same") !== false;
  const city = watch("city");

  const onSubmit = (values: OrgFormValues) => {
    const area = selectedPlace?.label?.trim() || fallbackArea.trim();
    if (!area) {
      toast.error("Pick the institution location on the map search.");
      return;
    }

    const formData = new FormData();
    formData.set("org_type", values.org_type);
    formData.set("name", values.name);
    formData.set("incharge_name", values.incharge_name);
    formData.set("incharge_phone", toE164India(values.incharge_phone));
    formData.set(
      "incharge_whatsapp_same",
      String(values.incharge_whatsapp_same),
    );
    if (!values.incharge_whatsapp_same && values.incharge_whatsapp) {
      formData.set(
        "incharge_whatsapp",
        toE164India(values.incharge_whatsapp),
      );
    }
    values.activities.forEach((activity) =>
      formData.append("activities", activity),
    );
    formData.set("city", values.city);
    formData.set("area", area);
    if (selectedPlace) {
      formData.set("place_id", selectedPlace.placeId);
      formData.set("latitude", String(selectedPlace.latitude));
      formData.set("longitude", String(selectedPlace.longitude));
    }
    formData.set("contact_email", values.contact_email.trim().toLowerCase());
    formData.set("contact_phone", toE164India(values.contact_phone));
    formData.set(
      "contact_whatsapp_same",
      String(values.contact_whatsapp_same),
    );
    if (!values.contact_whatsapp_same && values.contact_whatsapp) {
      formData.set("contact_whatsapp", toE164India(values.contact_whatsapp));
    }
    if (values.description) {
      formData.set("description", values.description);
    }

    startTransition(async () => {
      const result = await completeOrgOnboarding(formData);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Institution type
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This decides how you book teachers on CultureBeats.
          </p>
        </div>
        <Controller
          name="org_type"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="gap-3"
            >
              <label className="flex cursor-pointer gap-3 rounded-xl border border-border px-4 py-3 has-[:checked]:border-foreground">
                <RadioGroupItem value="school" className="mt-1" />
                <span>
                  <span className="block font-medium">School</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Students already attend your school for regular academics.
                    Cultural classes (dance, music, etc.) run alongside that
                    formal education.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-xl border border-border px-4 py-3 has-[:checked]:border-foreground">
                <RadioGroupItem value="academy" className="mt-1" />
                <span>
                  <span className="block font-medium">Academy</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    You mainly run cultural classes — dance, music, theatre, and
                    similar — not a full academic school.
                  </span>
                </span>
              </label>
            </RadioGroup>
          )}
        />
        {errors.org_type && (
          <p className="text-sm text-destructive">{errors.org_type.message}</p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold">
            {orgLabel} details
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Basic information about your institution.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Your login email</Label>
          <Input id="email" value={profile.email} disabled className="bg-muted" />
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

        <div className="space-y-3">
          <Label>Activities offered (optional)</Label>
          <Controller
            name="activities"
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
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Institution incharge
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Primary person we can reach about this {orgLabel.toLowerCase()}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="incharge_name">
            Incharge name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="incharge_name"
            placeholder="Full name"
            {...register("incharge_name")}
          />
          {errors.incharge_name && (
            <p className="text-sm text-destructive">
              {errors.incharge_name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="incharge_phone">
            Mobile number <span className="text-destructive">*</span>
          </Label>
          <Controller
            name="incharge_phone"
            control={control}
            render={({ field }) => (
              <IndiaPhoneField
                id="incharge_phone"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.incharge_phone}
              />
            )}
          />
          {errors.incharge_phone && (
            <p className="text-sm text-destructive">
              {errors.incharge_phone.message}
            </p>
          )}
          <Controller
            name="incharge_whatsapp_same"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const same = checked === true;
                    field.onChange(same);
                    if (same) setValue("incharge_whatsapp", "");
                  }}
                />
                <span>WhatsApp number is the same as phone</span>
              </label>
            )}
          />
        </div>

        {!inchargeWhatsappSame && (
          <div className="space-y-2">
            <Label htmlFor="incharge_whatsapp">
              WhatsApp number <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="incharge_whatsapp"
              control={control}
              render={({ field }) => (
                <IndiaPhoneField
                  id="incharge_whatsapp"
                  value={field.value || ""}
                  onChange={field.onChange}
                  invalid={!!errors.incharge_whatsapp}
                />
              )}
            />
            {errors.incharge_whatsapp && (
              <p className="text-sm text-destructive">
                {errors.incharge_whatsapp.message}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold">Location</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Exact place so teachers and families can find you.
          </p>
        </div>

        <div className="space-y-2">
          <Label>
            City <span className="text-destructive">*</span>
          </Label>
          <Controller
            name="city"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  setSelectedPlace(null);
                }}
                items={SERVICE_CITIES.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
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
          {errors.city && (
            <p className="text-sm text-destructive">{errors.city.message}</p>
          )}
        </div>

        {city ? (
          <PlaceAutocomplete
            city={city}
            value={selectedPlace}
            onChange={setSelectedPlace}
            required
            label="Exact place"
            description="Search and pick the institution address or landmark."
            fallbackArea={fallbackArea}
            onFallbackAreaChange={setFallbackArea}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a city to search for your exact place.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Institution contact
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Official contact details for the {orgLabel.toLowerCase()} office.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contact_email"
            type="email"
            placeholder="office@school.edu"
            {...register("contact_email")}
          />
          {errors.contact_email && (
            <p className="text-sm text-destructive">
              {errors.contact_email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Controller
            name="contact_phone"
            control={control}
            render={({ field }) => (
              <IndiaPhoneField
                id="contact_phone"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.contact_phone}
              />
            )}
          />
          {errors.contact_phone && (
            <p className="text-sm text-destructive">
              {errors.contact_phone.message}
            </p>
          )}
          <Controller
            name="contact_whatsapp_same"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const same = checked === true;
                    field.onChange(same);
                    if (same) setValue("contact_whatsapp", "");
                  }}
                />
                <span>WhatsApp number is the same as phone</span>
              </label>
            )}
          />
        </div>

        {!contactWhatsappSame && (
          <div className="space-y-2">
            <Label htmlFor="contact_whatsapp">
              WhatsApp number <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="contact_whatsapp"
              control={control}
              render={({ field }) => (
                <IndiaPhoneField
                  id="contact_whatsapp"
                  value={field.value || ""}
                  onChange={field.onChange}
                  invalid={!!errors.contact_whatsapp}
                />
              )}
            />
            {errors.contact_whatsapp && (
              <p className="text-sm text-destructive">
                {errors.contact_whatsapp.message}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="space-y-2">
        <Label htmlFor="description">About (optional)</Label>
        <Textarea
          id="description"
          placeholder="Anything else we should know about your institution"
          rows={3}
          {...register("description")}
        />
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? "Creating…" : `Create ${orgLabel.toLowerCase()}`}
      </Button>
    </form>
  );
}
