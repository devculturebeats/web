import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForgotPasswordPage() {
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
          <CardTitle className="font-heading text-xl">Reset password</CardTitle>
          <CardDescription>
            Enter your email and we will send you a link to choose a new
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
