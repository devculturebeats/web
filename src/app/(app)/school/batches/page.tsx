import { redirect } from "next/navigation";

export default function SchoolBatchesPage() {
  redirect("/school/students?tab=batches");
}
