"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isServiceCity } from "@/lib/locations";

export type TeacherProfileFormState = {
  error?: string;
  success?: boolean;
};

async function uploadTeacherDocument(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    userId: string;
    teacherId: string;
    file: File;
    documentType: string;
    folder: string;
  },
): Promise<string | null> {
  const ext = opts.file.name.split(".").pop() ?? "pdf";
  const path = `${opts.userId}/${opts.folder}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("certificates")
    .upload(path, opts.file);

  if (uploadError) {
    return `${opts.documentType} upload failed: ${uploadError.message}`;
  }

  const { error: docError } = await supabase.from("teacher_documents").insert({
    teacher_id: opts.teacherId,
    file_path: path,
    file_name: opts.file.name,
    document_type: opts.documentType,
  });

  if (docError) {
    return docError.message;
  }

  return null;
}

export async function saveTeacherProfile(
  formData: FormData,
  options: { completeOnboarding?: boolean } = {},
): Promise<TeacherProfileFormState> {
  const { completeOnboarding = false } = options;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const fullName = (formData.get("full_name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const whatsappSame = formData.get("whatsapp_same") === "true";
  const whatsappRaw = (formData.get("whatsapp") as string)?.trim();
  const primarySkill = (formData.get("primary_skill") as string)?.trim();
  const secondarySkills = formData.getAll("secondary_skills") as string[];
  const yearsRaw = formData.get("years_of_experience") as string;
  const bio = (formData.get("bio") as string)?.trim() || null;
  const qualifications =
    (formData.get("qualifications") as string)?.trim() || null;
  const residentialAddress =
    (formData.get("residential_address") as string)?.trim() || null;
  const teachingCityRaw =
    (formData.get("teaching_city") as string)?.trim() || null;
  const area = (formData.get("area") as string)?.trim() || null;
  const placeId = (formData.get("place_id") as string)?.trim() || null;
  const latRaw = (formData.get("latitude") as string)?.trim();
  const lngRaw = (formData.get("longitude") as string)?.trim();

  if (!fullName || !phone || !primarySkill) {
    return { error: "Full name, phone, and primary skill are required." };
  }

  if (!residentialAddress) {
    return { error: "Complete residential address is required." };
  }

  if (!teachingCityRaw || !isServiceCity(teachingCityRaw)) {
    return { error: "Select Mangalore or Udupi as your preferred teaching city." };
  }
  const teachingCity = teachingCityRaw;

  if (!area) {
    return {
      error:
        "Teaching locality is required so students and schools can find teachers near them.",
    };
  }

  const whatsapp = whatsappSame ? phone : whatsappRaw;
  if (!whatsapp || whatsapp.length < 10) {
    return { error: "Enter a valid WhatsApp number." };
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (latRaw && lngRaw) {
    latitude = Number(latRaw);
    longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { error: "Invalid location coordinates." };
    }
  }

  const yearsOfExperience = yearsRaw ? parseInt(yearsRaw, 10) : null;
  if (
    yearsOfExperience !== null &&
    (isNaN(yearsOfExperience) || yearsOfExperience < 0)
  ) {
    return { error: "Years of experience must be a valid number." };
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  let teacherId = teacher?.id;

  if (!teacherId) {
    const { data: newTeacher, error: insertError } = await supabase
      .from("teachers")
      .insert({ profile_id: user.id })
      .select("id")
      .single();

    if (insertError || !newTeacher) {
      return {
        error: insertError?.message ?? "Failed to create teacher profile.",
      };
    }
    teacherId = newTeacher.id;
  }

  let avatarUrl: string | null = null;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const ext = avatarFile.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true });

    if (uploadError) {
      return { error: `Avatar upload failed: ${uploadError.message}` };
    }

    const { data: publicUrl } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);
    avatarUrl = publicUrl.publicUrl;
  }

  const profileUpdate: {
    full_name: string;
    phone: string;
    whatsapp: string;
    avatar_url?: string;
    onboarding_completed?: boolean;
  } = {
    full_name: fullName,
    phone,
    whatsapp,
  };

  if (avatarUrl) {
    profileUpdate.avatar_url = avatarUrl;
  }

  if (completeOnboarding) {
    profileUpdate.onboarding_completed = true;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: teacherError } = await supabase
    .from("teachers")
    .update({
      primary_skill: primarySkill,
      secondary_skills: secondarySkills,
      years_of_experience: yearsOfExperience,
      bio,
      qualifications,
      residential_address: residentialAddress,
      city: teachingCity,
      area,
      place_id: placeId,
      latitude,
      longitude,
    })
    .eq("profile_id", user.id);

  if (teacherError) {
    return { error: teacherError.message };
  }

  const certificateFile = formData.get("certificate") as File | null;
  if (certificateFile && certificateFile.size > 0) {
    const certError = await uploadTeacherDocument(supabase, {
      userId: user.id,
      teacherId,
      file: certificateFile,
      documentType: "certificate",
      folder: "certificate",
    });
    if (certError) return { error: certError };
  }

  const resumeFile = formData.get("resume") as File | null;
  if (resumeFile && resumeFile.size > 0) {
    const resumeError = await uploadTeacherDocument(supabase, {
      userId: user.id,
      teacherId,
      file: resumeFile,
      documentType: "resume",
      folder: "resume",
    });
    if (resumeError) return { error: resumeError };
  }

  revalidatePath("/dashboard");
  revalidatePath("/teacher/profile");
  revalidatePath("/onboarding/teacher");

  if (completeOnboarding) {
    redirect("/dashboard");
  }

  return { success: true };
}

export async function completeTeacherOnboarding(
  formData: FormData,
): Promise<TeacherProfileFormState> {
  return saveTeacherProfile(formData, { completeOnboarding: true });
}

export async function updateTeacherProfile(
  formData: FormData,
): Promise<TeacherProfileFormState> {
  return saveTeacherProfile(formData, { completeOnboarding: false });
}
