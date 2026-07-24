"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function useClientPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    page: safePage,
    pageItems,
    totalPages,
    total,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    hasPrev: safePage > 0,
    hasNext: safePage < totalPages - 1,
    prev: () => setPage((current) => Math.max(0, current - 1)),
    next: () => setPage((current) => Math.min(totalPages - 1, current + 1)),
  };
}

export function PaginationControls({
  from,
  to,
  total,
  pageSize,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  label = "items",
}: {
  from: number;
  to: number;
  total: number;
  pageSize: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  label?: string;
}) {
  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-xs text-muted-foreground">
        {from}–{to} of {total} {label}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function PaginatedList<T>({
  items,
  pageSize,
  label,
  children,
}: {
  items: T[];
  pageSize: number;
  label?: string;
  children: (pageItems: T[]) => ReactNode;
}) {
  const pagination = useClientPagination(items, pageSize);

  return (
    <div className="space-y-3">
      {children(pagination.pageItems)}
      <PaginationControls
        from={pagination.from}
        to={pagination.to}
        total={pagination.total}
        pageSize={pagination.pageSize}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prev}
        onNext={pagination.next}
        label={label}
      />
    </div>
  );
}
