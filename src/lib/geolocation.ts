import { Decimal } from "@prisma/client/runtime/library";

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number | Decimal | null | undefined,
  lon1: number | Decimal | null | undefined,
  lat2: number | Decimal | null | undefined,
  lon2: number | Decimal | null | undefined
): number | null {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return null;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLon = toRadians(Number(lon2) - Number(lon1));

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(Number(lat1))) *
      Math.cos(toRadians(Number(lat2))) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get bounding box for a location (for nearby search)
 * Returns { minLat, maxLat, minLon, maxLon }
 */
export function getBoundingBox(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  const R = 6371; // Earth's radius in kilometers
  const latDelta = radiusKm / R;
  const lonDelta = radiusKm / (R * Math.cos(toRadians(latitude)));

  return {
    minLat: latitude - latDelta * (180 / Math.PI),
    maxLat: latitude + latDelta * (180 / Math.PI),
    minLon: longitude - lonDelta * (180 / Math.PI),
    maxLon: longitude + lonDelta * (180 / Math.PI),
  };
}