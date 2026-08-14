import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { endOfDay, startOfDay } from 'date-fns';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { DiaryQaService } from '../services/diary-qa.service';
import { DiarySearchService } from '../services/diary-search.service';
import { ReelsQaService } from '../services/reels-qa.service';
import { ReelsService } from '../services/reels.service';

export interface McpAuthContext {
  authorized: boolean;
  // Diary scope of the caller (from the X-Chat-Id header); requires a valid key
  chatId: bigint | null;
}

const DEFAULT_MAP_LIMIT = 20;
const MAX_MAP_LIMIT = 50;
const MAX_SEARCH_LIMIT = 30;
const SNIPPET_CHARS = 500;

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

@Injectable()
export class McpToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diarySearch: DiarySearchService,
    private readonly diaryQa: DiaryQaService,
    private readonly reelsService: ReelsService,
    private readonly reelsQa: ReelsQaService,
  ) {}

  /**
   * A fresh server per request (stateless Streamable HTTP): the tool set
   * depends on the caller — anonymous clients only see the map tools.
   */
  createServer(auth: McpAuthContext, baseUrl: string): McpServer {
    const server = new McpServer(
      { name: 'vlandivir-2025', version: '1.0.0' },
      {
        instructions: [
          'Инструменты по личным данным сайта vlandivir.com: карта мест (публичная),',
          'записная книжка Instagram-рилсов и личный дневник.',
          'Приватные инструменты появляются только при подключении с API-ключом',
          '(Authorization: Bearer) и, для дневника, заголовком X-Chat-Id.',
        ].join(' '),
      },
    );

    this.registerMapTools(server, baseUrl);
    if (auth.authorized) {
      this.registerReelsTools(server);
      if (auth.chatId !== null) {
        this.registerDiaryTools(server, auth.chatId);
      }
    }
    return server;
  }

  // --- Map (public) ---

  private registerMapTools(server: McpServer, baseUrl: string): void {
    server.registerTool(
      'map_search',
      {
        title: 'Поиск по карте мест',
        description:
          'Ищет точки и треки на карте по подстроке в названии/описании и/или по тегам. ' +
          'Нужен хотя бы один из параметров query и tags.',
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe(
              'Подстрока для поиска в названии и описании (регистр не важен)',
            ),
          tags: z
            .array(z.string())
            .optional()
            .describe('Вернутся объекты, содержащие все перечисленные теги'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_MAP_LIMIT)
            .optional()
            .describe(
              `Максимум результатов (по умолчанию ${DEFAULT_MAP_LIMIT})`,
            ),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ query, tags, limit }) => {
        const q = query?.trim();
        const tagList = [
          ...new Set(
            (tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
          ),
        ];
        if (!q && !tagList.length) {
          return this.errorResult('Укажите query и/или tags');
        }
        const take = limit ?? DEFAULT_MAP_LIMIT;

        const textFilter = q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { description: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {};
        const tagFilter = tagList.length ? { tags: { hasEvery: tagList } } : {};

        const [points, tracks] = await Promise.all([
          this.prisma.mapPoint.findMany({
            where: { AND: [textFilter, tagFilter] },
            orderBy: { createdAt: 'desc' },
            take,
          }),
          this.prisma.mapTrack.findMany({
            where: { AND: [textFilter, tagFilter] },
            orderBy: { createdAt: 'desc' },
            take,
          }),
        ]);

        const results = [
          ...points.map((point) => ({
            createdAt: point.createdAt,
            item: {
              type: 'point' as const,
              id: point.id,
              name: point.name,
              description: this.truncate(point.description),
              latitude: point.latitude,
              longitude: point.longitude,
              tags: point.tags,
              url: `${baseUrl}/places/point/${point.id}`,
            },
          })),
          ...tracks.map((track) => ({
            createdAt: track.createdAt,
            item: {
              type: 'track' as const,
              id: track.id,
              name: track.name,
              description: this.truncate(track.description),
              tags: track.tags,
              url: `${baseUrl}/places/track/${track.id}`,
            },
          })),
        ]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)
          .map((entry) => entry.item);

        return this.jsonResult({ count: results.length, results });
      },
    );

    server.registerTool(
      'map_get',
      {
        title: 'Точка или трек карты целиком',
        description:
          'Возвращает полное содержимое точки или трека карты по id. ' +
          'Для трека вместо сырого списка координат возвращаются количество точек, ' +
          'рамка (bounding box), старт и финиш.',
        inputSchema: {
          type: z.enum(['point', 'track']).describe('Тип объекта'),
          id: z.number().int().describe('Id объекта (из map_search)'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ type, id }) => {
        if (type === 'point') {
          const point = await this.prisma.mapPoint.findUnique({
            where: { id },
          });
          if (!point) return this.errorResult(`Точка ${id} не найдена`);
          return this.jsonResult({
            type: 'point',
            id: point.id,
            name: point.name,
            description: point.description,
            latitude: point.latitude,
            longitude: point.longitude,
            tags: point.tags,
            instagramUrl: point.instagramUrl,
            createdAt: point.createdAt.toISOString(),
            url: `${baseUrl}/places/point/${point.id}`,
          });
        }

        const track = await this.prisma.mapTrack.findUnique({ where: { id } });
        if (!track) return this.errorResult(`Трек ${id} не найден`);
        const points = Array.isArray(track.points)
          ? (track.points as [number, number][])
          : [];
        const latitudes = points.map((p) => p[0]);
        const longitudes = points.map((p) => p[1]);
        return this.jsonResult({
          type: 'track',
          id: track.id,
          name: track.name,
          description: track.description,
          tags: track.tags,
          instagramUrl: track.instagramUrl,
          pointsCount: points.length,
          bounds: points.length
            ? {
                minLatitude: Math.min(...latitudes),
                maxLatitude: Math.max(...latitudes),
                minLongitude: Math.min(...longitudes),
                maxLongitude: Math.max(...longitudes),
              }
            : null,
          start: points[0] ?? null,
          finish: points[points.length - 1] ?? null,
          createdAt: track.createdAt.toISOString(),
          url: `${baseUrl}/places/track/${track.id}`,
        });
      },
    );

    server.registerTool(
      'map_tags_list',
      {
        title: 'Словарь тегов',
        description:
          'Список всех тегов (с эмодзи). Словарь общий для карты и записной книжки рилсов; ' +
          'значения подходят для параметра tags в map_search.',
        annotations: { readOnlyHint: true },
      },
      async () => {
        const tags = await this.prisma.mapTag.findMany({
          orderBy: { name: 'asc' },
        });
        return this.jsonResult(
          tags.map((tag) => ({ name: tag.name, emoji: tag.emoji })),
        );
      },
    );
  }

  // --- Reels (API key required) ---

  private registerReelsTools(server: McpServer): void {
    server.registerTool(
      'reels_search',
      {
        title: 'Поиск по записной книжке рилсов',
        description:
          'Семантический поиск по сохранённым Instagram-рилсам: названия, описания, теги, ' +
          'расшифровки речи и описания происходящего на экране.',
        inputSchema: {
          query: z.string().min(1).describe('Поисковый запрос на любом языке'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_SEARCH_LIMIT)
            .optional()
            .describe('Максимум результатов (по умолчанию 12)'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ query, limit }) => {
        const hits = await this.reelsService.searchReels(query, limit ?? 12);
        if (!hits.length) return this.jsonResult({ count: 0, results: [] });

        const reels = await this.prisma.reel.findMany({
          where: { id: { in: hits.map((hit) => hit.id) } },
        });
        const reelById = new Map(reels.map((reel) => [reel.id, reel]));
        const results = hits.flatMap((hit) => {
          const reel = reelById.get(hit.id);
          if (!reel) return [];
          return [
            {
              id: reel.id,
              title: reel.title,
              author: reel.author,
              tags: reel.tags,
              similarity: this.round(hit.similarity),
              instagramUrl: reel.instagramUrl,
            },
          ];
        });
        return this.jsonResult({ count: results.length, results });
      },
    );

    server.registerTool(
      'reels_get',
      {
        title: 'Рилс целиком',
        description:
          'Полное содержимое сохранённого рилса по id: описание, расшифровка речи, ' +
          'описание видеоряда, теги и ссылки.',
        inputSchema: {
          id: z.number().int().describe('Id рилса (из reels_search)'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ id }) => {
        const reel = await this.prisma.reel.findUnique({ where: { id } });
        if (!reel) return this.errorResult(`Рилс ${id} не найден`);
        return this.jsonResult({
          id: reel.id,
          shortcode: reel.shortcode,
          instagramUrl: reel.instagramUrl,
          status: reel.status,
          title: reel.title,
          description: reel.description,
          author: reel.author,
          publishedAt: reel.publishedAt?.toISOString() ?? null,
          duration: reel.duration,
          tags: reel.tags,
          transcript: reel.transcriptClean || reel.transcript,
          transcriptLang: reel.transcriptLang,
          visionDescription: reel.visionDescription,
          videoUrl: reel.videoUrl,
          coverUrl: reel.coverUrl,
        });
      },
    );

    server.registerTool(
      'reels_ask',
      {
        title: 'Вопрос к записной книжке рилсов',
        description:
          'Отвечает на вопрос по содержимому сохранённых рилсов (RAG): находит подходящие ' +
          'ролики и формулирует ответ только по ним, со ссылками [#id].',
        inputSchema: {
          question: z.string().min(1).describe('Вопрос на любом языке'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ question }) => {
        const result = await this.reelsQa.ask(question);
        if (!result) {
          return this.textResult(
            'В записной книжке ничего подходящего не нашлось.',
          );
        }
        return this.jsonResult(result);
      },
    );
  }

  // --- Diary (API key + X-Chat-Id required) ---

  private registerDiaryTools(server: McpServer, chatId: bigint): void {
    server.registerTool(
      'diary_search',
      {
        title: 'Поиск по дневнику',
        description:
          'Семантический поиск по заметкам дневника и описаниям приложенных фото. ' +
          'Возвращает лучшие совпадения с датами; полный текст — через diary_get_note.',
        inputSchema: {
          query: z.string().min(1).describe('Поисковый запрос'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_SEARCH_LIMIT)
            .optional()
            .describe('Максимум результатов (по умолчанию 8)'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ query, limit }) => {
        const hits = await this.diarySearch.retrieve(chatId, query, limit ?? 8);
        return this.jsonResult({
          count: hits.length,
          results: hits.map((hit) => ({
            noteId: hit.noteId,
            date: hit.noteDate.toISOString(),
            text: this.truncate(hit.content, SNIPPET_CHARS),
            similarity: this.round(hit.similarity),
            viaImage: hit.viaImage,
          })),
        });
      },
    );

    server.registerTool(
      'diary_get_note',
      {
        title: 'Заметка дневника целиком',
        description:
          'Полный текст заметки дневника по id, с приложенными фото и видео ' +
          '(ссылки и описания).',
        inputSchema: {
          noteId: z.number().int().describe('Id заметки (из diary_search)'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ noteId }) => {
        const note = await this.prisma.note.findFirst({
          where: { id: noteId, chatId, deletedAt: null },
          include: { images: true, videos: true },
        });
        if (!note) return this.errorResult(`Заметка ${noteId} не найдена`);
        return this.jsonResult(this.serializeNote(note));
      },
    );

    server.registerTool(
      'diary_get_day',
      {
        title: 'Дневник за день',
        description: 'Все заметки дневника за указанную дату, с фото и видео.',
        inputSchema: {
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .describe('Дата в формате YYYY-MM-DD'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ date }) => {
        const [year, month, day] = date.split('-').map(Number);
        const parsed = new Date(year, month - 1, day);
        if (
          Number.isNaN(parsed.getTime()) ||
          parsed.getMonth() !== month - 1 ||
          parsed.getDate() !== day
        ) {
          return this.errorResult(`Некорректная дата: ${date}`);
        }

        const notes = await this.prisma.note.findMany({
          where: {
            chatId,
            deletedAt: null,
            noteDate: { gte: startOfDay(parsed), lt: endOfDay(parsed) },
          },
          include: { images: true, videos: true },
          orderBy: { noteDate: 'asc' },
        });
        return this.jsonResult({
          date,
          count: notes.length,
          notes: notes.map((note) => this.serializeNote(note)),
        });
      },
    );

    server.registerTool(
      'diary_history',
      {
        title: 'В этот день в прошлые годы',
        description:
          'Все заметки дневника за указанный день (месяц и число) по всем годам сразу, ' +
          'сгруппированные по годам — «что было в этот день». По умолчанию — сегодня.',
        inputSchema: {
          date: z
            .string()
            .regex(/^\d{2}-\d{2}$/)
            .optional()
            .describe(
              'День в формате MM-DD (например 07-15); по умолчанию сегодня',
            ),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ date }) => {
        const now = new Date();
        const [month, day] = date
          ? date.split('-').map(Number)
          : [now.getMonth() + 1, now.getDate()];
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return this.errorResult(`Некорректная дата: ${date}`);
        }

        const rows = await this.prisma.$queryRaw<{ id: number }[]>`
          SELECT "id" FROM "Note"
          WHERE "chatId" = ${chatId}
            AND "deletedAt" IS NULL
            AND EXTRACT(MONTH FROM "noteDate") = ${month}
            AND EXTRACT(DAY FROM "noteDate") = ${day}
        `;
        const notes = rows.length
          ? await this.prisma.note.findMany({
              where: {
                id: { in: rows.map((row) => row.id) },
                deletedAt: null,
              },
              include: { images: true, videos: true },
              orderBy: { noteDate: 'asc' },
            })
          : [];

        const byYear = new Map<
          number,
          ReturnType<McpToolsService['serializeNote']>[]
        >();
        for (const note of notes) {
          const year = note.noteDate.getFullYear();
          const bucket = byYear.get(year) ?? [];
          bucket.push(this.serializeNote(note));
          byYear.set(year, bucket);
        }

        const pad = (value: number) => String(value).padStart(2, '0');
        return this.jsonResult({
          date: `${pad(month)}-${pad(day)}`,
          years: [...byYear.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([year, yearNotes]) => ({
              year,
              count: yearNotes.length,
              notes: yearNotes,
            })),
        });
      },
    );

    server.registerTool(
      'diary_ask',
      {
        title: 'Вопрос к дневнику',
        description:
          'Отвечает на вопрос по дневнику (RAG): находит подходящие заметки и формулирует ' +
          'ответ только по ним, с датами заметок-источников.',
        inputSchema: {
          question: z.string().min(1).describe('Вопрос на любом языке'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ question }) => {
        const answer = await this.diaryQa.answer(chatId, question);
        return this.textResult(
          answer ?? 'В дневнике ничего подходящего не нашлось.',
        );
      },
    );
  }

  // --- Helpers ---

  private serializeNote(note: {
    id: number;
    content: string;
    noteDate: Date;
    images: { url: string; description: string | null }[];
    videos: { url: string; description: string | null }[];
  }) {
    return {
      noteId: note.id,
      date: note.noteDate.toISOString(),
      content: note.content,
      images: note.images.map((image) => ({
        url: image.url,
        description: image.description,
      })),
      videos: note.videos.map((video) => ({
        url: video.url,
        description: video.description,
      })),
    };
  }

  private jsonResult(data: unknown): ToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  private textResult(text: string): ToolResult {
    return { content: [{ type: 'text', text }] };
  }

  private errorResult(message: string): ToolResult {
    return { content: [{ type: 'text', text: message }], isError: true };
  }

  private truncate(
    text: string | null | undefined,
    limit = 300,
  ): string | null {
    if (!text) return null;
    const collapsed = text.replace(/\s+/g, ' ').trim();
    return collapsed.length > limit
      ? `${collapsed.slice(0, limit)}…`
      : collapsed;
  }

  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
