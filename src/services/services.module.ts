import { Module } from '@nestjs/common';
import { DateParserService } from './date-parser.service';
import { StorageService } from './storage.service';
import { LlmService } from './llm.service';
import { PdfService } from './pdf.service';
import { DebugLogService } from './debug-log.service';
import { InstagramMetaService } from './instagram-meta.service';
import { ReelsService } from './reels.service';
import { TripProjectsService } from './trip-projects.service';
import { EmbeddingsService } from './embeddings.service';
import { MapSearchService } from './map-search.service';
import { DiarySearchService } from './diary-search.service';
import { ReelsQaService } from './reels-qa.service';
import { DiaryQaService } from './diary-qa.service';
import { EmailIngestService } from './email-ingest.service';
import { EmailExecutorService } from './email-executor.service';
import { EmailClassifierService } from './email-classifier.service';
import { EmailRulesRunnerService } from './email-rules-runner.service';
import { TripThumbsService } from './trip-thumbs.service';

@Module({
  providers: [
    DateParserService,
    StorageService,
    LlmService,
    PdfService,
    DebugLogService,
    InstagramMetaService,
    ReelsService,
    TripProjectsService,
    EmbeddingsService,
    MapSearchService,
    DiarySearchService,
    ReelsQaService,
    DiaryQaService,
    EmailIngestService,
    EmailExecutorService,
    EmailClassifierService,
    EmailRulesRunnerService,
    TripThumbsService,
  ],
  exports: [
    DateParserService,
    StorageService,
    LlmService,
    PdfService,
    DebugLogService,
    InstagramMetaService,
    ReelsService,
    TripProjectsService,
    EmbeddingsService,
    MapSearchService,
    DiarySearchService,
    ReelsQaService,
    DiaryQaService,
    EmailIngestService,
    EmailExecutorService,
    EmailClassifierService,
    EmailRulesRunnerService,
    TripThumbsService,
  ],
})
export class ServicesModule {}
