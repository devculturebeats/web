"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { signOut } from "@/lib/auth/actions";
import {
  getDashboardPath,
  getNavLinks,
  getRoleLabel,
} from "@/lib/auth/roles";
import type { CurrentProfile } from "@/lib/profiles";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function AppNav({ profile }: { profile: CurrentProfile }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navLinks = getNavLinks(profile.role);
  const homeHref = getDashboardPath(profile.role);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navLinks.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href={homeHref}
          className="font-heading text-lg font-semibold text-primary"
        >
          CultureBeats
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks />
          <span
            aria-hidden
            className="mx-2 inline-block h-4 w-px shrink-0 bg-border"
          />
          <span className="px-2 text-xs text-muted-foreground">
            {getRoleLabel(profile.role)}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen(true)}
        >
          <MenuIcon className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-heading text-left">
                CultureBeats
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <Separator className="my-4" />
            <p className="px-3 text-xs text-muted-foreground">
              Signed in as {profile.full_name || profile.email}
            </p>
            <p className="px-3 text-xs text-muted-foreground">
              {getRoleLabel(profile.role)}
            </p>
            <form action={signOut} className="mt-4 px-3">
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
