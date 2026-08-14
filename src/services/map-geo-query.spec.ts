import { haversineKm, parseGeoConstraint } from './map-geo-query';

describe('parseGeoConstraint', () => {
  it('returns null for a purely thematic query', () => {
    expect(
      parseGeoConstraint('Порекомендуй озеро с красивым видом'),
    ).toBeNull();
  });

  it('extracts place and hour-based radius, stripping the geo phrasing', () => {
    const result = parseGeoConstraint(
      'Куда поехать искупаться в часе езды от Белграда?',
    );
    expect(result).not.toBeNull();
    expect(result?.placeQuery).toBe('Белграда');
    expect(result?.radiusKm).toBe(70);
    expect(result?.cleanedQuery.toLowerCase()).toContain('искупаться');
    expect(result?.cleanedQuery).not.toContain('Белград');
    expect(result?.cleanedQuery.toLowerCase()).not.toContain('час');
  });

  it('parses an explicit kilometre radius', () => {
    const result = parseGeoConstraint('водопады в 40 км от Ниша');
    expect(result?.placeQuery).toBe('Ниша');
    expect(result?.radiusKm).toBe(40);
  });

  it('parses multi-hour driving radius', () => {
    const result = parseGeoConstraint('горы в 2 часах езды от Белграда');
    expect(result?.radiusKm).toBe(140);
  });

  it('handles "рядом с" with a default radius', () => {
    const result = parseGeoConstraint('кофейни рядом с Нови-Садом');
    expect(result?.placeQuery).toBe('Нови-Садом');
    expect(result?.radiusKm).toBe(30);
  });
});

describe('haversineKm', () => {
  it('computes a known distance (Belgrade to Novi Sad ~70 km)', () => {
    const belgrade = { latitude: 44.8125, longitude: 20.4612 };
    const noviSad = { latitude: 45.2671, longitude: 19.8335 };
    const distance = haversineKm(belgrade, noviSad);
    expect(distance).toBeGreaterThan(65);
    expect(distance).toBeLessThan(80);
  });

  it('is zero for identical points', () => {
    const point = { latitude: 44.8, longitude: 20.4 };
    expect(haversineKm(point, point)).toBeCloseTo(0, 5);
  });
});
