export const INDIA_PHONE_REGEX = /^\d{10}$/;

export function toLocalPhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function toE164India(localDigits: string): string {
  return `+91${localDigits}`;
}
