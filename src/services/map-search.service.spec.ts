import { Test, TestingModule } from '@nestjs/testing';
import { MapSearchService } from './map-search.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { ReelsService } from './reels.service';

const SHORTCODE_RE =
  /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;

describe('MapSearchService.search', () => {
  let service: MapSearchService;
  let embeddingsSearch: jest.Mock;
  let pointFindMany: jest.Mock;
  let trackFindMany: jest.Mock;
  let reelFindMany: jest.Mock;

  beforeEach(async () => {
    pointFindMany = jest.fn();
    trackFindMany = jest.fn();
    reelFindMany = jest.fn();
    embeddingsSearch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapSearchService,
        {
          provide: PrismaService,
          useValue: {
            mapPoint: { findMany: pointFindMany },
            mapTrack: { findMany: trackFindMany },
            reel: { findMany: reelFindMany },
          },
        },
        { provide: EmbeddingsService, useValue: { search: embeddingsSearch } },
        {
          provide: ReelsService,
          useValue: {
            extractShortcode: (url: string) =>
              SHORTCODE_RE.exec(url)?.[1] ?? null,
          },
        },
      ],
    }).compile();

    service = module.get<MapSearchService>(MapSearchService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns map features linked to matching reels, ranked by similarity', async () => {
    pointFindMany.mockResolvedValue([
      {
        id: 1,
        instagramUrl: 'https://instagram.com/reel/AAA/',
        latitude: 44.8,
        longitude: 20.4,
      },
      {
        id: 2,
        instagramUrl: 'https://instagram.com/p/BBB/',
        latitude: 45.0,
        longitude: 20.5,
      },
    ]);
    trackFindMany.mockResolvedValue([
      {
        id: 10,
        instagramUrl: 'https://instagram.com/reel/CCC/',
        points: [[44.9, 20.45]],
      },
    ]);
    reelFindMany.mockResolvedValue([
      { id: 100, shortcode: 'AAA' },
      { id: 200, shortcode: 'BBB' },
      { id: 300, shortcode: 'CCC' },
    ]);
    embeddingsSearch.mockResolvedValue([
      { refId: 300, similarity: 0.9 },
      { refId: 100, similarity: 0.5 },
      { refId: 200, similarity: 0.4 },
    ]);

    const result = await service.search('озеро с красивым видом');

    expect(result.geo).toBeNull();
    expect(result.hits).toEqual([
      { type: 'track', id: 10, similarity: 0.9 },
      { type: 'point', id: 1, similarity: 0.5 },
      { type: 'point', id: 2, similarity: 0.4 },
    ]);

    // Search is restricted to the reels that are actually linked from the map.
    const [, , options] = embeddingsSearch.mock.calls[0];
    expect([...options.refIds].sort((a: number, b: number) => a - b)).toEqual([
      100, 200, 300,
    ]);
  });

  it('filters by distance and attaches it when the query names a place', async () => {
    // Belgrade ~ (44.8, 20.46). Point 1 is next to it, point 2 is ~600 km away.
    pointFindMany.mockResolvedValue([
      {
        id: 1,
        instagramUrl: 'https://instagram.com/reel/AAA/',
        latitude: 44.82,
        longitude: 20.44,
      },
      {
        id: 2,
        instagramUrl: 'https://instagram.com/reel/BBB/',
        latitude: 50.45,
        longitude: 30.52,
      },
    ]);
    trackFindMany.mockResolvedValue([]);
    reelFindMany.mockResolvedValue([
      { id: 100, shortcode: 'AAA' },
      { id: 200, shortcode: 'BBB' },
    ]);
    embeddingsSearch.mockResolvedValue([
      { refId: 200, similarity: 0.8 },
      { refId: 100, similarity: 0.6 },
    ]);

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '44.8125', lon: '20.4612' }],
    } as unknown as Response);

    const result = await service.search(
      'Куда поехать искупаться в часе езды от Белграда?',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.geo).toEqual({
      place: 'Белграда',
      radiusKm: 70,
      center: { latitude: 44.8125, longitude: 20.4612 },
    });
    // Only the nearby point survives the 70 km radius; the far one is dropped.
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ type: 'point', id: 1 });
    expect(result.hits[0].distanceKm).toBeLessThan(5);

    // The place phrasing is stripped from the embedded (thematic) query.
    const [, semanticQuery] = embeddingsSearch.mock.calls[0];
    expect(semanticQuery.toLowerCase()).toContain('искупаться');
    expect(semanticQuery).not.toContain('Белград');
  });

  it('short-circuits without calling the embeddings API when no reels are linked', async () => {
    pointFindMany.mockResolvedValue([]);
    trackFindMany.mockResolvedValue([]);

    const result = await service.search('куда поехать искупаться');

    expect(result.hits).toEqual([]);
    expect(reelFindMany).not.toHaveBeenCalled();
    expect(embeddingsSearch).not.toHaveBeenCalled();
  });

  it('ignores an empty query', async () => {
    const result = await service.search('   ');
    expect(result.hits).toEqual([]);
    expect(pointFindMany).not.toHaveBeenCalled();
    expect(embeddingsSearch).not.toHaveBeenCalled();
  });
});
