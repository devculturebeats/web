import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
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
          <CardTitle className="font-heading text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue to your classes, school, or teaching home.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
