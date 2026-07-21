"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MapPinIcon, XIcon } from "lucide-react";

import {
  getPlaceDetails,
  isPlacesConfigured,
  searchPlaces,
  type PlaceDetails,
  type PlaceSuggestion,
} from "@/lib/places/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SelectedPlace = PlaceDetails;

type PlaceAutocompleteProps = {
  city: string;
  value: SelectedPlace | null;
  onChange: (place: SelectedPlace | null) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  description?: string;
  fallbackArea?: string;
  onFallbackAreaChange?: (area: string) => void;
};

export function PlaceAutocomplete({
  city,
  value,
  onChange,
  disabled,
  required,
  label = "Area / locality",
  description,
  fallbackArea = "",
  onFallbackAreaChange,
}: PlaceAutocompleteProps) {
  const listId = useId();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    isPlacesConfigured().then((ok) => {
      if (active) setConfigured(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!configured || !city || query.trim().length < 2 || value) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(() => {
      startTransition(async () => {
        const result = await searchPlaces(query, city);
        if (result.error) {
          setError(result.error);
          setSuggestions([]);
          return;
        }
        setError(null);
        setSuggestions(result.suggestions);
        setOpen(true);
      });
    }, 280);

    return () => clearTimeout(handle);
  }, [query, city, configured, value]);

  const selectSuggestion = (suggestion: PlaceSuggestion) => {
    startTransition(async () => {
      const result = await getPlaceDetails(suggestion.placeId);
      if (result.error || !result.place) {
        setError(result.error ?? "Could not load place details.");
        return;
      }
      setError(null);
      onChange(result.place);
      setQuery("");
      setSuggestions([]);
      setOpen(false);
    });
  };

  if (configured === null) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        <Input disabled placeholder="Loading location search…" />
      </div>
    );
  }

  // Without an API key, keep a plain area field so onboarding still works.
  if (!configured) {
    return (
      <div className="space-y-2">
        <Label htmlFor="area-fallback">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        <Input
          id="area-fallback"
          value={fallbackArea}
          disabled={disabled || !city}
          placeholder={
            city
              ? `e.g. locality in ${city}`
              : "Select a city first"
          }
          onChange={(e) => onFallbackAreaChange?.(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Add <code className="text-[11px]">GOOGLE_MAPS_API_KEY</code> to enable
          Google Places search and save coordinates for nearby matching.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}

      {value ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{value.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved with map coordinates for nearby search
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Clear location"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={query}
            disabled={disabled || !city}
            placeholder={
              city
                ? `Search area in ${city}…`
                : "Select a city first"
            }
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
          />
          {open && suggestions.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              className={cn(
                "absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md",
              )}
            >
              {suggestions.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      selectSuggestion(suggestion);
                    }}
                  >
                    <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{suggestion.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isPending && (
            <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
