import { revalidatePath } from "next/cache";

const SCHOOL_PATHS = [
  "/school",
  "/school/batches",
  "/school/classes",
  "/school/students",
  "/school/notify",
] as const;

/** Revalidate school admin routes after mutations that affect portal data. */
export function revalidateSchoolPaths(
  paths: readonly (typeof SCHOOL_PATHS)[number][] = SCHOOL_PATHS,
) {
  for (const path of paths) {
    revalidatePath(path);
  }
}
