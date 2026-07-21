import Link from "next/link";

import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UpdatePasswordPage() {
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
          <CardTitle className="font-heading text-xl">Choose a new password</CardTitle>
          <CardDescription>
            Enter and confirm your new password to finish resetting your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
