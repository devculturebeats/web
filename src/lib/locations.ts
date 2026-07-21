export const SERVICE_CITIES = [
  {
    value: "Mangalore",
    label: "Mangalore",
    // City-center bias for Places Autocomplete
    latitude: 12.9141,
    longitude: 74.856,
    radiusMeters: 25000,
  },
  {
    value: "Udupi",
    label: "Udupi",
    latitude: 13.3409,
    longitude: 74.7421,
    radiusMeters: 20000,
  },
] as const;

export type ServiceCity = (typeof SERVICE_CITIES)[number]["value"];

export const SERVICE_CITY_VALUES = SERVICE_CITIES.map((c) => c.value) as [
  ServiceCity,
  ...ServiceCity[],
];

export function isServiceCity(value: string): value is ServiceCity {
  return SERVICE_CITY_VALUES.includes(value as ServiceCity);
}

export function getServiceCity(value: string | null | undefined) {
  if (!value) return null;
  return SERVICE_CITIES.find((c) => c.value === value) ?? null;
}
