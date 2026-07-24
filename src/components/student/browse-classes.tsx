"use client";

import Link from "next/link";

import type { MarketplaceClass } from "@/components/student/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginatedList } from "@/components/ui/client-pagination";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type BrowseClassesProps = {
  marketplaceClasses: MarketplaceClass[];
};

export function BrowseClasses({ marketplaceClasses }: BrowseClassesProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Find a class to enroll in — open one to continue. Home studio classes
        let you pick which day and time slots you want.
      </p>
      {marketplaceClasses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open classes available right now.
        </p>
      ) : (
        <PaginatedList items={marketplaceClasses} pageSize={12} label="classes">
          {(pageItems) => (
            <div className="grid gap-3">
              {pageItems.map((cls) => {
                const placeParts = [
                  cls.isHomeStudio
                    ? cls.teacherName
                      ? `Home studio · ${cls.teacherName}`
                      : "Home studio"
                    : (cls.orgName ?? "Academy"),
                  cls.skill,
                  cls.locationLabel &&
                  cls.locationLabel !== "Home studio" &&
                  cls.locationLabel !== "At school / academy"
                    ? cls.locationLabel
                    : !cls.isHomeStudio
                      ? cls.locationLabel
                      : null,
                ].filter(Boolean);

                return (
                  <Card key={cls.id}>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="font-medium">
                          <Link
                            href={`/classes/${cls.id}`}
                            className="hover:underline"
                          >
                            {cls.title}
                          </Link>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {placeParts.join(" · ")}
                        </p>
                        {cls.description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {cls.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {cls.rateLabel && (
                            <Badge variant="secondary">{cls.rateLabel}</Badge>
                          )}
                          {cls.spotsLeft != null && (
                            <Badge variant="outline">
                              {cls.spotsLeft} spot
                              {cls.spotsLeft === 1 ? "" : "s"} left
                            </Badge>
                          )}
                          {cls.startsAt && (
                            <Badge variant="outline">
                              Starts {formatDateTime(cls.startsAt)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/classes/${cls.id}`}
                        className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
                      >
                        Enroll
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </PaginatedList>
      )}
    </div>
  );
}
