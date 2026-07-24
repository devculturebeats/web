"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { getDashboardPath, getNavLinks } from "@/lib/auth/roles";
import type { CurrentProfile } from "@/lib/profiles";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AppNav({
  profile,
  orgApproved = true,
}: {
  profile: CurrentProfile;
  orgApproved?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Defer Sheet until after mount so Base UI ids don't hydrate-mismatch.
  const [menuReady, setMenuReady] = useState(false);
  const pathname = usePathname();
  const navLinks = getNavLinks(profile.role, { orgApproved });
  const homeHref =
    !orgApproved &&
    (profile.role === "school_admin" || profile.role === "academy_admin")
      ? "/pending-approval"
      : getDashboardPath(profile.role);

  useEffect(() => {
    setMenuReady(true);
  }, []);

  const accountActive =
    pathname === "/account/password" || pathname.startsWith("/account/");

  const linkClass = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-muted text-foreground"
        : "text-foreground/80 hover:bg-muted hover:text-foreground",
    );

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navLinks.map((link) => {
        const exact = pathname === link.href;
        const nested =
          link.href !== "/" && pathname.startsWith(`${link.href}/`);
        const moreSpecificMatch = navLinks.some(
          (other) =>
            other.href !== link.href &&
            other.href.startsWith(`${link.href}/`) &&
            (pathname === other.href ||
              pathname.startsWith(`${other.href}/`)),
        );
        const active = exact || (nested && !moreSpecificMatch);

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={linkClass(active)}
            suppressHydrationWarning
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
          suppressHydrationWarning
        >
          CultureBeats
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks />
          <Link
            href="/account/password"
            className={linkClass(accountActive)}
            suppressHydrationWarning
          >
            My account
          </Link>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen(true)}
          disabled={!menuReady}
        >
          <MenuIcon className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>

        {menuReady ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-heading text-left">
                  CultureBeats
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                <NavLinks onNavigate={() => setOpen(false)} />
                <Link
                  href="/account/password"
                  onClick={() => setOpen(false)}
                  className={linkClass(accountActive)}
                >
                  My account
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </header>
  );
}
