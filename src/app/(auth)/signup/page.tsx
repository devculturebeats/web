import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AppRole } from "@/types/database";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const validRoles = ["teacher", "student", "school_admin"];
  const defaultRole = validRoles.includes(role ?? "")
    ? (role as AppRole)
    : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-atmosphere px-4 py-10">
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="font-heading text-2xl font-semibold text-primary"
        >
          CultureBeats
        </Link>
      </div>

      <Card className="w-full max-w-md border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Join CultureBeats</CardTitle>
          <CardDescription>
            Create your account and start connecting with the cultural arts
            community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm defaultRole={defaultRole} />
        </CardContent>
      </Card>
    </div>
  );
}
