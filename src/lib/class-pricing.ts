import type { RateUnit } from "@/lib/constants";

export function formatClassRate(
  amount: number | string | null | undefined,
  currency = "INR",
  unit: RateUnit | string = "hour",
): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return null;

  const formatted =
    currency === "INR"
      ? `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : `${currency} ${value.toLocaleString("en-IN")}`;

  const unitLabel =
    unit === "hour" ? "hour" : unit === "session" ? "session" : "course";
  return `${formatted} / ${unitLabel}`;
}

export function formatLocationType(
  locationType: string | null | undefined,
): string | null {
  switch (locationType) {
    case "home_studio":
      return "Home studio";
    case "online":
      return "Online";
    case "venue":
      return "Studio / venue";
    case "at_org":
      return "At school / academy";
    default:
      return null;
  }
}
