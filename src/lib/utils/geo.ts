/**
 * Calcule la distance entre deux points GPS en mètres (Formule de Haversine)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance en mètres
}

/**
 * Vérifie si un point est dans un rayon donné (default 500m)
 */
export function isWithinGeofence(
  targetLat: number,
  targetLng: number,
  baseLat: number,
  baseLng: number,
  radiusMeters = 500
): boolean {
  if (!targetLat || !targetLng || !baseLat || !baseLng) return true; // On assume OK si coordonnées manquantes (fallback)
  const distance = calculateDistance(targetLat, targetLng, baseLat, baseLng);
  return distance <= radiusMeters;
}
