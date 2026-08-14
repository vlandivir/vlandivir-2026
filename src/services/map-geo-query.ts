// Heuristic parser for a geographic constraint expressed in a Russian search
// query, e.g. "куда поехать искупаться в часе езды от Белграда". It extracts a
// place name (a proper noun following a spatial preposition) and a radius in
// km, and returns the query with the geo phrasing stripped so the semantic
// search embeds only the thematic part. Returns null when there is no geo
// constraint — the caller then behaves like a plain semantic search.

export interface GeoConstraint {
  placeQuery: string;
  radiusKm: number;
  cleanedQuery: string;
}

const DEFAULT_RADIUS_KM = 30;
const KM_PER_DRIVING_HOUR = 70;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 300;

// A spatial preposition followed by a capitalised place name (up to 3 words).
const PLACE_RE =
  /(?:недалеко\s+от|неподал[её]ку\s+от|поблизости\s+от|рядом\s+со?|близ|около|возле|вокруг|от|у)\s+([А-ЯЁ][А-Яа-яё-]+(?:\s+[А-ЯЁ][А-Яа-яё-]+){0,2})/;

// Radius phrasing to strip from the thematic query. Note: JS \b / \w only
// recognise ASCII, so Cyrillic word tails are matched with explicit ranges.
const RADIUS_CLEAN_RE =
  /(?:в\s+)?(?:\d+(?:[.,]\d+)?\s*)?(?:км|километр[а-яё]*|получас[а-яё]*|час[а-яё]*|минут[а-яё]*|мин)(?:\s+(?:езды|пути|на\s+машине|на\s+авто))?/gi;

export function parseGeoConstraint(query: string): GeoConstraint | null {
  const placeMatch = PLACE_RE.exec(query);
  if (!placeMatch) return null;

  const placeQuery = placeMatch[1].trim();
  const radiusKm = parseRadiusKm(query);

  const cleaned = query
    .replace(placeMatch[0], ' ')
    .replace(RADIUS_CLEAN_RE, ' ')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { placeQuery, radiusKm, cleanedQuery: cleaned };
}

function parseRadiusKm(query: string): number {
  const q = query.toLowerCase();

  const km = /(\d+(?:[.,]\d+)?)\s*(?:км|километ)/.exec(q);
  if (km) return clampRadius(toNumber(km[1]));

  const hours = /(\d+(?:[.,]\d+)?)\s*час/.exec(q);
  if (hours) return clampRadius(toNumber(hours[1]) * KM_PER_DRIVING_HOUR);

  if (/получас/.test(q)) return clampRadius(KM_PER_DRIVING_HOUR / 2);
  if (/час[а-яё]*\s+езд|в\s+час/.test(q)) return KM_PER_DRIVING_HOUR;

  const mins = /(\d+)\s*мин/.exec(q);
  if (mins) return clampRadius((toNumber(mins[1]) / 60) * KM_PER_DRIVING_HOUR);

  return DEFAULT_RADIUS_KM;
}

function toNumber(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

function clampRadius(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_RADIUS_KM;
  return Math.min(Math.max(km, MIN_RADIUS_KM), MAX_RADIUS_KM);
}

// Great-circle distance in kilometres between two WGS84 points.
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
