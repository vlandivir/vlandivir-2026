import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
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
import { ToolPagesService } from './tool-pages.service';
import { GtdModule } from '../gtd/gtd.module';

@Module({
  imports: [AuthModule, forwardRef(() => GtdModule)],
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
    ToolPagesService,
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
    ToolPagesService,
  ],
})
export class ServicesModule {}
