"use server";

import { getServiceCity } from "@/lib/locations";

export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

export type PlaceDetails = {
  placeId: string;
  label: string;
  latitude: number;
  longitude: number;
};

function getPlacesApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export async function isPlacesConfigured(): Promise<boolean> {
  return Boolean(getPlacesApiKey());
}

export async function searchPlaces(
  input: string,
  city: string,
): Promise<{ suggestions: PlaceSuggestion[]; error?: string }> {
  const apiKey = getPlacesApiKey();
  if (!apiKey) {
    return {
      suggestions: [],
      error: "Google Places is not configured. Add GOOGLE_MAPS_API_KEY.",
    };
  }

  const query = input.trim();
  if (query.length < 2) {
    return { suggestions: [] };
  }

  const serviceCity = getServiceCity(city);
  if (!serviceCity) {
    return { suggestions: [], error: "Select Mangalore or Udupi first." };
  }

  const body = {
    input: query,
    languageCode: "en",
    includedRegionCodes: ["in"],
    locationBias: {
      circle: {
        center: {
          latitude: serviceCity.latitude,
          longitude: serviceCity.longitude,
        },
        radius: serviceCity.radiusMeters,
      },
    },
  };

  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return {
      suggestions: [],
      error: `Places search failed (${response.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
      };
    }>;
  };

  const suggestions: PlaceSuggestion[] = [];
  for (const item of data.suggestions ?? []) {
    const prediction = item.placePrediction;
    if (!prediction?.placeId || !prediction.text?.text) continue;
    suggestions.push({
      placeId: prediction.placeId,
      label: prediction.text.text,
    });
  }

  return { suggestions };
}

export async function getPlaceDetails(
  placeId: string,
): Promise<{ place?: PlaceDetails; error?: string }> {
  const apiKey = getPlacesApiKey();
  if (!apiKey) {
    return { error: "Google Places is not configured." };
  }

  const id = placeId.trim();
  if (!id) return { error: "Place is required." };

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,formattedAddress,displayName,location",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return {
      error: `Place details failed (${response.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await response.json()) as {
    id?: string;
    formattedAddress?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
  };

  const latitude = data.location?.latitude;
  const longitude = data.location?.longitude;
  if (
    !data.id ||
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    return { error: "Place is missing coordinates." };
  }

  return {
    place: {
      placeId: data.id,
      label:
        data.formattedAddress ||
        data.displayName?.text ||
        "Selected location",
      latitude,
      longitude,
    },
  };
}
