export const ART_SKILLS = [
  "Dance",
  "Singing",
  "Instrument",
  "Theatre",
  "Martial Arts",
  "Folk Arts",
  "Other",
] as const;

export type ArtSkill = (typeof ART_SKILLS)[number];

export const CLASS_LOCATION_TYPES = [
  { value: "home_studio", label: "Home studio" },
  { value: "online", label: "Online" },
  { value: "venue", label: "Studio / venue" },
  { value: "at_org", label: "At school / academy" },
] as const;

export type ClassLocationType = (typeof CLASS_LOCATION_TYPES)[number]["value"];

export const RATE_UNITS = [
  { value: "hour", label: "per hour" },
  { value: "session", label: "per session" },
  { value: "course", label: "per course" },
] as const;

export type RateUnit = (typeof RATE_UNITS)[number]["value"];

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export const SIGNUP_ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "school_admin", label: "School" },
  { value: "academy_admin", label: "Academy" },
] as const;
