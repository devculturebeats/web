import { redirect } from "next/navigation";

import { BrowseClasses } from "@/components/student/browse-classes";
import { getCurrentProfile } from "@/lib/profiles";
import { loadBrowseClassesData } from "@/lib/student/data";

export default async function BrowseClassesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "student") redirect("/dashboard");

  const { marketplaceClasses } = await loadBrowseClassesData(profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Browse classes</h1>
        <p className="mt-1 text-muted-foreground">
          Find open classes from home studios and academies.
        </p>
      </div>
      <BrowseClasses marketplaceClasses={marketplaceClasses} />
    </div>
  );
}
