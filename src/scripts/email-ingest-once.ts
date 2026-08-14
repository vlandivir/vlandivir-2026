// One-off email ingest run for local testing:
//   npx ts-node src/scripts/email-ingest-once.ts
// Requires EMAIL_ACCOUNTS (and DO Spaces / Postgres credentials) in .env.
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../services/storage.service';
import { EmailIngestService } from '../services/email-ingest.service';
import { EmailClassifierService } from '../services/email-classifier.service';
import { EmailExecutorService } from '../services/email-executor.service';
import { EmailRulesRunnerService } from '../services/email-rules-runner.service';

async function main() {
  const configService = new ConfigService();
  const prisma = new PrismaService();
  const storage = new StorageService(configService);
  const classifier = new EmailClassifierService(configService);
  const executor = new EmailExecutorService(configService, prisma);
  const rulesRunner = new EmailRulesRunnerService(
    configService,
    prisma,
    classifier,
    executor,
  );
  const ingest = new EmailIngestService(
    configService,
    prisma,
    storage,
    rulesRunner,
  );

  try {
    const { results, rules } = await ingest.syncAll();
    if (results.length === 0) {
      console.log('Nothing to do (EMAIL_ACCOUNTS not configured?)');
      return;
    }
    for (const result of results) {
      const suffix = result.error ? ` — ERROR: ${result.error}` : '';
      console.log(
        `${result.account}: ${result.ingested} new, ${result.skipped} already known${suffix}`,
      );
    }
    console.log(
      `rules: ${rules.processed} processed, ${rules.applied} applied, ${rules.errors} errors`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
