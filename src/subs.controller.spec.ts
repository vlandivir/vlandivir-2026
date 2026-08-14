import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Request, Response } from 'express';
import type { Readable } from 'stream';
import { getDiaryChatIdNumber } from './diary.constants';
import { StorageService } from './services/storage.service';
import { SubsController } from './subs.controller';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

describe('SubsController', () => {
  let controller: SubsController;
  let storageService: {
    downloadFile: jest.Mock;
    getSubsVideoUrl: jest.Mock;
    uploadSubsVideoStream: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let telegramBotService: {
    sendDirectMessage: jest.Mock;
  };
  let tmpDir: string;
  let req: Request;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'subs-controller-test-'));
    storageService = {
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('video')),
      getSubsVideoUrl: jest
        .fn()
        .mockReturnValue(
          'https://fra1.digitaloceanspaces.com/vlandivir-2025/subs/videos/hash/source',
        ),
      uploadSubsVideoStream: jest
        .fn()
        .mockImplementation(async (stream: Readable) => {
          for await (const chunk of stream) {
            void chunk;
            // Drain the stream like the real DO upload does before the tmp file is removed.
          }
          return 'https://fra1.digitaloceanspaces.com/vlandivir-2025/subs/videos/hash/source';
        }),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    telegramBotService = {
      sendDirectMessage: jest.fn().mockResolvedValue({ messageId: 123 }),
    };

    controller = new SubsController(
      storageService as unknown as StorageService,
      configService as unknown as ConfigService,
      telegramBotService as unknown as TelegramBotService,
    );
    jest
      .spyOn(
        controller as unknown as { createHash: () => string },
        'createHash',
      )
      .mockReturnValue('aea4b8455e75d098f37454f9');
    jest
      .spyOn(
        controller as unknown as {
          assertUploadVideoMeetsRequirements: () => Promise<void>;
        },
        'assertUploadVideoMeetsRequirements',
      )
      .mockResolvedValue();
    req = {
      protocol: 'https',
      header: jest.fn().mockReturnValue(undefined),
      get: jest.fn().mockReturnValue('vlandivir.com'),
    } as unknown as Request;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('sends a Telegram notification after uploading a Subs video to DO storage', async () => {
    const videoPath = join(tmpDir, 'video.mp4');
    await writeFile(videoPath, Buffer.from('video'));

    const result = await controller.uploadVideo(
      {
        path: videoPath,
        originalname: 'ride.mp4',
        mimetype: 'video/mp4',
        size: 5 * 1024 * 1024,
      },
      req,
    );

    expect(result).toEqual(
      expect.objectContaining({
        hash: 'aea4b8455e75d098f37454f9',
        absolutePageUrl: 'https://vlandivir.com/subs/aea4b8455e75d098f37454f9',
        videoUrl:
          'https://fra1.digitaloceanspaces.com/vlandivir-2025/subs/videos/hash/source',
      }),
    );
    expect(telegramBotService.sendDirectMessage).toHaveBeenCalledWith(
      getDiaryChatIdNumber(),
      expect.stringContaining(
        'DO файл: https://fra1.digitaloceanspaces.com/vlandivir-2025/subs/videos/hash/source',
      ),
    );
    expect(telegramBotService.sendDirectMessage).toHaveBeenCalledWith(
      getDiaryChatIdNumber(),
      expect.stringContaining(
        'Страница: https://vlandivir.com/subs/aea4b8455e75d098f37454f9',
      ),
    );
  });

  it('keeps the upload response when the Telegram notification fails', async () => {
    const videoPath = join(tmpDir, 'video.mp4');
    await writeFile(videoPath, Buffer.from('video'));
    telegramBotService.sendDirectMessage.mockRejectedValue(
      new Error('Telegram failed'),
    );
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      controller.uploadVideo(
        {
          path: videoPath,
          originalname: 'ride.mp4',
          mimetype: 'video/mp4',
          size: 5,
        },
        req,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        hash: 'aea4b8455e75d098f37454f9',
      }),
    );
  });

  it('serves the source video through the app for canvas-safe preview', async () => {
    const send = jest.fn();
    const set = jest.fn();
    const status = jest.fn();
    const rangeReq = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const res = { send, set, status } as unknown as Response;

    await controller.streamSourceVideo(
      'aea4b8455e75d098f37454f9',
      rangeReq,
      res,
    );

    expect(storageService.getSubsVideoUrl).toHaveBeenCalledWith(
      'aea4b8455e75d098f37454f9',
    );
    expect(storageService.downloadFile).toHaveBeenCalledWith(
      'https://fra1.digitaloceanspaces.com/vlandivir-2025/subs/videos/hash/source',
    );
    expect(set).toHaveBeenCalledWith({
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
    });
    expect(set).toHaveBeenCalledWith('Content-Length', '5');
    expect(send).toHaveBeenCalledWith(Buffer.from('video'));
    expect(status).not.toHaveBeenCalled();
  });

  it('serves source video byte ranges for browser seeking', async () => {
    storageService.downloadFile.mockResolvedValue(Buffer.from('video-frame'));
    const send = jest.fn();
    const set = jest.fn();
    const status = jest.fn();
    const rangeReq = {
      header: jest.fn().mockReturnValue('bytes=6-10'),
    } as unknown as Request;
    const res = { send, set, status } as unknown as Response;

    await controller.streamSourceVideo(
      'aea4b8455e75d098f37454f9',
      rangeReq,
      res,
    );

    expect(status).toHaveBeenCalledWith(206);
    expect(set).toHaveBeenCalledWith({
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
    });
    expect(set).toHaveBeenCalledWith({
      'Content-Range': 'bytes 6-10/11',
      'Content-Length': '5',
    });
    expect(send).toHaveBeenCalledWith(Buffer.from('frame'));
  });

  it('translates transcript lines while preserving the original timestamps', async () => {
    configService.get.mockReturnValue('test-openai-key');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                lines: [
                  { index: 0, text: 'I rode' },
                  { index: 1, text: 'along the shore' },
                ],
              }),
            },
          },
        ],
      }),
    } as unknown as globalThis.Response);

    const result = await controller.translateTranscript(
      'aea4b8455e75d098f37454f9',
      {
        sourceLanguage: 'ru',
        targetLanguage: 'en',
        text: '0.00 Прокатился\n0.80 по берегу',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        sourceLanguage: 'ru',
        targetLanguage: 'en',
        model: 'gpt-5',
        text: '0.00 I rode\n0.80 along the shore',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-openai-key',
        }),
      }),
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(body.messages[1].content).toContain('Прокатился');
  });

  it('rejects transcript translation text without timestamped lines', async () => {
    configService.get.mockReturnValue('test-openai-key');
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      controller.translateTranscript('aea4b8455e75d098f37454f9', {
        sourceLanguage: 'ru',
        targetLanguage: 'en',
        text: 'Прокатился по берегу',
      }),
    ).rejects.toThrow('must start with a timestamp');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
