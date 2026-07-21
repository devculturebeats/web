import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getDashboardPath } from "@/lib/auth/roles";
import { teacherNeedsOnboarding } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const home =
          nextParam &&
          nextParam.startsWith("/") &&
          !nextParam.startsWith("//")
            ? nextParam
            : getDashboardPath((profile?.role ?? "student") as AppRole);

        const needsOnboarding = await teacherNeedsOnboarding(user.id);
        redirect(needsOnboarding ? "/onboarding/teacher" : home);
      }

      redirect(
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/dashboard",
      );
    }
  }

  redirect("/login?error=confirmation_failed");
}
