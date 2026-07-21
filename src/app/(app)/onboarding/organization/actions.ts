"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ART_SKILLS } from "@/lib/constants";
import { getDashboardPath } from "@/lib/auth/roles";
import { SERVICE_CITY_VALUES } from "@/lib/locations";
import { orgTypeForRole } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export type OrgOnboardingState = {
  error?: string;
  success?: boolean;
};

const ALLOWED_ACTIVITIES = new Set<string>(
  ART_SKILLS.filter((s) => s !== "Other"),
);

export async function completeOrgOnboarding(
  formData: FormData,
): Promise<OrgOnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile not found." };

  const orgType = orgTypeForRole(profile.role as AppRole);
  if (!orgType) {
    return { error: "Only school or academy admins can register an organization." };
  }

  const name = (formData.get("name") as string)?.trim();
  const inchargeName = (formData.get("incharge_name") as string)?.trim();
  const inchargePhone = (formData.get("incharge_phone") as string)?.trim();
  const inchargeWhatsappSame =
    (formData.get("incharge_whatsapp_same") as string) !== "false";
  const inchargeWhatsappRaw = (formData.get("incharge_whatsapp") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const area = (formData.get("area") as string)?.trim() || null;
  const placeId = (formData.get("place_id") as string)?.trim() || null;
  const latitudeRaw = (formData.get("latitude") as string)?.trim();
  const longitudeRaw = (formData.get("longitude") as string)?.trim();
  const contactEmail = (formData.get("contact_email") as string)
    ?.trim()
    .toLowerCase();
  const contactPhone = (formData.get("contact_phone") as string)?.trim();
  const contactWhatsappSame =
    (formData.get("contact_whatsapp_same") as string) !== "false";
  const contactWhatsappRaw = (formData.get("contact_whatsapp") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const activities = formData
    .getAll("activities")
    .map((v) => String(v).trim())
    .filter((v) => ALLOWED_ACTIVITIES.has(v));

  if (!name) return { error: "Institution name is required." };
  if (!inchargeName) return { error: "Incharge name is required." };
  if (!inchargePhone) return { error: "Incharge mobile number is required." };
  if (!city || !(SERVICE_CITY_VALUES as readonly string[]).includes(city)) {
    return { error: "Select a valid city." };
  }
  if (!area) return { error: "Institution location is required." };
  if (!contactEmail) return { error: "Institution email is required." };
  if (!contactPhone) return { error: "Institution phone is required." };

  const inchargeWhatsapp = inchargeWhatsappSame
    ? inchargePhone
    : inchargeWhatsappRaw || null;
  if (!inchargeWhatsappSame && !inchargeWhatsapp) {
    return { error: "Incharge WhatsApp number is required." };
  }

  const contactWhatsapp = contactWhatsappSame
    ? contactPhone
    : contactWhatsappRaw || null;
  if (!contactWhatsappSame && !contactWhatsapp) {
    return { error: "Institution WhatsApp number is required." };
  }

  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      type: orgType,
      name,
      city,
      area,
      description,
      incharge_name: inchargeName,
      activities,
      place_id: placeId,
      latitude:
        latitude != null && Number.isFinite(latitude) ? latitude : null,
      longitude:
        longitude != null && Number.isFinite(longitude) ? longitude : null,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      contact_whatsapp: contactWhatsapp,
      approval_status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Failed to create organization." };
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      profile_id: user.id,
      member_role: "admin",
    });

  if (memberError) {
    return { error: memberError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: inchargeName,
      phone: inchargePhone,
      whatsapp: inchargeWhatsapp,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/onboarding/organization");
  revalidatePath("/school");
  revalidatePath("/academy");
  revalidatePath("/dashboard");

  redirect(getDashboardPath(profile.role as AppRole));
}
