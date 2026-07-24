import { redirect } from "next/navigation";

import { ParentHome } from "@/components/parent/parent-home";
import { loadParentHomeData } from "@/app/(app)/parent/actions";
import { getCurrentProfile } from "@/lib/profiles";

export default async function ParentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "parent") redirect("/dashboard");

  const data = await loadParentHomeData(profile.id);

  return (
    <ParentHome
      childrenList={data.children}
      selectedChildId={data.selectedChildId}
      pendingIncoming={data.pendingIncoming}
      pendingOutgoing={data.pendingOutgoing}
      upcomingSessions={data.upcomingSessions}
      myClasses={data.myClasses}
    />
  );
}
