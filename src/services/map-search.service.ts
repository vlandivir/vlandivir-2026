import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import {
  GeoConstraint,
  haversineKm,
  parseGeoConstraint,
} from './map-geo-query';
import { ReelsService } from './reels.service';

export interface MapSearchHit {
  type: 'point' | 'track';
  id: number;
  similarity: number;
  distanceKm?: number;
}

export interface MapSearchGeo {
  place: string;
  radiusKm: number;
  center: { latitude: number; longitude: number };
}

export interface MapSearchResult {
  geo: MapSearchGeo | null;
  hits: MapSearchHit[];
}

interface FeatureRef {
  type: 'point' | 'track';
  id: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// Map-linked reels are a small subset, so keep the bar low: we want relevant
// recommendations, not just near-exact matches.
const MIN_SIMILARITY = 0.2;
const GEOCODE_TIMEOUT_MS = 8 * 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MapSearchService {
  private readonly logger = new Logger(MapSearchService.name);
  private readonly geocodeCache = new Map<
    string,
    { at: number; center: { latitude: number; longitude: number } | null }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly reelsService: ReelsService,
  ) {}

  /**
   * Semantic search over map features that have an attached Instagram reel.
   * The reels already carry embeddings (title + description + tags +
   * transcript + on-screen description), so we reuse them and only return the
   * map points/tracks whose reel matches the query, ranked by similarity.
   *
   * When the query carries a geographic constraint ("in an hour's drive from
   * Belgrade", "near X"), the place is geocoded and results are filtered to
   * those within the parsed radius, with the distance attached.
   */
  async search(query: string, limit = DEFAULT_LIMIT): Promise<MapSearchResult> {
    const q = query.trim();
    if (!q) return { geo: null, hits: [] };
    const take = Math.min(
      Math.max(Math.floor(limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const geoConstraint = parseGeoConstraint(q);
    const semanticQuery = this.pickSemanticQuery(q, geoConstraint);

    // Map every linked reel shortcode to the feature(s) that reference it, and
    // remember each feature's coordinates for the optional distance filter.
    const [points, tracks] = await Promise.all([
      this.prisma.mapPoint.findMany({
        where: { instagramUrl: { not: null } },
        select: {
          id: true,
          instagramUrl: true,
          latitude: true,
          longitude: true,
        },
      }),
      this.prisma.mapTrack.findMany({
        where: { instagramUrl: { not: null } },
        select: { id: true, instagramUrl: true, points: true },
      }),
    ]);

    const featuresByShortcode = new Map<string, FeatureRef[]>();
    const coordsByFeature = new Map<
      string,
      { latitude: number; longitude: number }[]
    >();
    const key = (feature: FeatureRef) => `${feature.type}:${feature.id}`;
    const addFeature = (
      instagramUrl: string | null,
      feature: FeatureRef,
      coords: { latitude: number; longitude: number }[],
    ) => {
      if (!instagramUrl) return;
      const shortcode = this.reelsService.extractShortcode(instagramUrl);
      if (!shortcode) return;
      const list = featuresByShortcode.get(shortcode) ?? [];
      list.push(feature);
      featuresByShortcode.set(shortcode, list);
      coordsByFeature.set(key(feature), coords);
    };
    for (const point of points) {
      addFeature(point.instagramUrl, { type: 'point', id: point.id }, [
        { latitude: point.latitude, longitude: point.longitude },
      ]);
    }
    for (const track of tracks) {
      addFeature(
        track.instagramUrl,
        { type: 'track', id: track.id },
        this.trackCoords(track.points),
      );
    }
    if (!featuresByShortcode.size) return { geo: null, hits: [] };

    const reels = await this.prisma.reel.findMany({
      where: { shortcode: { in: [...featuresByShortcode.keys()] } },
      select: { id: true, shortcode: true },
    });
    if (!reels.length) return { geo: null, hits: [] };

    const featuresByReelId = new Map<number, FeatureRef[]>();
    for (const reel of reels) {
      const features = featuresByShortcode.get(reel.shortcode);
      if (features) featuresByReelId.set(reel.id, features);
    }
    const reelIds = [...featuresByReelId.keys()];
    if (!reelIds.length) return { geo: null, hits: [] };

    // Over-fetch reel hits: several reels can point at the same feature, and a
    // geo filter may drop many; we dedupe and trim afterwards.
    const hits = await this.embeddingsService.search('reel', semanticQuery, {
      limit: Math.min(
        (geoConstraint ? take * 5 : take * 3) || take,
        MAX_LIMIT * 5,
      ),
      minSimilarity: MIN_SIMILARITY,
      refIds: reelIds,
    });

    const bestByFeature = new Map<string, MapSearchHit>();
    for (const hit of hits) {
      const features = featuresByReelId.get(hit.refId);
      if (!features) continue;
      for (const feature of features) {
        const existing = bestByFeature.get(key(feature));
        if (!existing || hit.similarity > existing.similarity) {
          bestByFeature.set(key(feature), {
            type: feature.type,
            id: feature.id,
            similarity: hit.similarity,
          });
        }
      }
    }

    let ranked = [...bestByFeature.values()].sort(
      (a, b) => b.similarity - a.similarity,
    );

    // Apply the geographic filter, if any place was recognised and geocoded.
    let geo: MapSearchGeo | null = null;
    if (geoConstraint) {
      const center = await this.geocode(geoConstraint.placeQuery);
      if (center) {
        geo = {
          place: geoConstraint.placeQuery,
          radiusKm: geoConstraint.radiusKm,
          center,
        };
        ranked = ranked.flatMap((hit) => {
          const coords = coordsByFeature.get(`${hit.type}:${hit.id}`);
          const distanceKm = this.nearestDistanceKm(center, coords);
          if (distanceKm === null || distanceKm > geoConstraint.radiusKm) {
            return [];
          }
          return [{ ...hit, distanceKm: Math.round(distanceKm * 10) / 10 }];
        });
      }
    }

    return { geo, hits: ranked.slice(0, take) };
  }

  private pickSemanticQuery(
    query: string,
    geoConstraint: GeoConstraint | null,
  ): string {
    if (!geoConstraint) return query;
    // Fall back to the full query if stripping the geo phrasing left too little
    // to embed meaningfully.
    const cleaned = geoConstraint.cleanedQuery.trim();
    return cleaned.length >= 3 ? cleaned : query;
  }

  private trackCoords(
    points: unknown,
  ): { latitude: number; longitude: number }[] {
    if (!Array.isArray(points)) return [];
    return points.flatMap((point) =>
      Array.isArray(point) &&
      typeof point[0] === 'number' &&
      typeof point[1] === 'number'
        ? [{ latitude: point[0], longitude: point[1] }]
        : [],
    );
  }

  private nearestDistanceKm(
    center: { latitude: number; longitude: number },
    coords: { latitude: number; longitude: number }[] | undefined,
  ): number | null {
    if (!coords || !coords.length) return null;
    let min = Infinity;
    for (const coord of coords) {
      const distance = haversineKm(center, coord);
      if (distance < min) min = distance;
    }
    return Number.isFinite(min) ? min : null;
  }

  private async geocode(
    place: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const cacheKey = place.trim().toLowerCase();
    const cached = this.geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < GEOCODE_CACHE_TTL_MS) {
      return cached.center;
    }

    let center: { latitude: number; longitude: number } | null = null;
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '1',
        q: place,
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'vlandivir-2025 map search (https://vlandivir.com)',
          },
          signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
        },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          lat?: string;
          lon?: string;
        }[];
        const first = data[0];
        if (first?.lat && first?.lon) {
          const latitude = parseFloat(first.lat);
          const longitude = parseFloat(first.lon);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            center = { latitude, longitude };
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Geocoding failed for "${place}": ${(error as Error).message}`,
      );
    }

    this.geocodeCache.set(cacheKey, { at: Date.now(), center });
    return center;
  }
}
