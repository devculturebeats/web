"use client";

import { Input } from "@/components/ui/input";
import { toLocalPhoneDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function IndiaPhoneField({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (localDigits: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid &&
          "border-destructive ring-3 ring-destructive/20 aria-invalid:border-destructive",
      )}
    >
      <span className="shrink-0 border-r border-input px-3 text-sm text-muted-foreground">
        +91
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        aria-invalid={invalid}
        disabled={disabled}
        className="border-0 shadow-none focus-visible:ring-0"
        value={value}
        onChange={(e) => onChange(toLocalPhoneDigits(e.target.value))}
      />
    </div>
  );
}
