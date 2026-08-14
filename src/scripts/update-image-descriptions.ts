import { writeFileSync } from 'fs';
import { PrismaClient, Prisma } from '../generated/prisma-client';
import { LlmService } from '../services/llm.service';
import { StorageService } from '../services/storage.service';
import { ConfigService } from '@nestjs/config';

interface UpdateResult {
  success: boolean;
  imageId: number;
  error?: string;
  description?: string;
}

// Error messages that LlmService returns instead of a real description;
// rows containing these are treated as having no description.
const ERROR_DESCRIPTIONS = [
  'Не удалось описать изображение',
  'Ошибка API OpenAI',
  'Превышено время ожидания ответа от OpenAI',
  'Модель отказалась описать изображение',
  'Неожиданный формат ответа от OpenAI',
  'Не удалось получить описание от OpenAI',
  'Ошибка конфигурации API ключа',
  'Ошибка при обработке ответа от OpenAI',
];

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit =
    limitIndex !== -1 && args[limitIndex + 1]
      ? parseInt(args[limitIndex + 1], 10)
      : null;

  const force = args.includes('--force');

  const olderThanIndex = args.indexOf('--older-than');
  const olderThan =
    olderThanIndex !== -1 && args[olderThanIndex + 1]
      ? new Date(args[olderThanIndex + 1])
      : null;
  if (olderThan && isNaN(olderThan.getTime())) {
    throw new Error('Invalid --older-than date, expected YYYY-MM-DD');
  }

  return { limit, force, olderThan };
}

async function updateImageDescriptions() {
  const { limit, force, olderThan } = parseArgs();
  const prisma = new PrismaClient();
  const configService = new ConfigService();
  const storageService = new StorageService(configService);
  const llmService = new LlmService(configService);

  try {
    console.log('Starting image description update...');
    if (force) {
      console.log('⚠️  --force: regenerating existing descriptions');
    }
    if (olderThan) {
      console.log(
        `📅 Only images created before ${olderThan.toISOString().slice(0, 10)}`,
      );
    }
    if (limit) {
      console.log(`📋 Processing at most ${limit} images (newest first)`);
    }

    // Check if OpenAI API key is configured
    const apiKey = configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      console.error(
        '❌ OPENAI_API_KEY is not configured. Please set it in your environment variables.',
      );
      return;
    }

    // Without --force: images with no real description (empty or an error text).
    // With --force: every image. --older-than narrows either mode by createdAt.
    const missingDescription: Prisma.ImageWhereInput = {
      OR: [
        { description: null },
        { description: '' },
        { description: { in: ERROR_DESCRIPTIONS } },
      ],
    };
    const where: Prisma.ImageWhereInput = {
      ...(force ? {} : missingDescription),
      ...(olderThan ? { createdAt: { lt: olderThan } } : {}),
    };

    const imagesWithoutDescriptions = await prisma.image.findMany({
      where,
      include: {
        note: true,
      },
      orderBy: {
        createdAt: 'desc', // Get newest first
      },
      ...(limit ? { take: limit } : {}),
    });

    console.log(`Found ${imagesWithoutDescriptions.length} images to process`);

    if (imagesWithoutDescriptions.length === 0) {
      console.log('✅ No images need description updates');
      return;
    }

    // Back up current descriptions before overwriting anything
    const backupPath = `image-descriptions-backup-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;
    writeFileSync(
      backupPath,
      JSON.stringify(
        imagesWithoutDescriptions.map((img) => ({
          id: img.id,
          url: img.url,
          description: img.description,
        })),
        null,
        2,
      ),
    );
    console.log(`💾 Backed up current descriptions to ${backupPath}`);

    // Process images in batches to avoid rate limits
    const batchSize = 5; // Reduced batch size for better rate limit handling
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    const results: UpdateResult[] = [];

    for (let i = 0; i < imagesWithoutDescriptions.length; i += batchSize) {
      const batch = imagesWithoutDescriptions.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(
        imagesWithoutDescriptions.length / batchSize,
      );

      console.log(
        `\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} images)`,
      );

      // Process batch with individual error handling
      const batchPromises = batch.map(async (image) => {
        try {
          console.log(`  🔄 Processing image ${image.id} (${image.url})`);

          // Download image from storage
          const imageBuffer = await storageService.downloadFile(image.url);

          // Get description from LLM, with the note text as context
          const description = await llmService.describeImage(
            imageBuffer,
            undefined,
            image.note?.content,
          );

          // Skip if description is one of the error messages
          if (ERROR_DESCRIPTIONS.includes(description)) {
            throw new Error('LLM service returned error message');
          }

          // Update database
          await prisma.image.update({
            where: { id: image.id },
            data: { description },
          });

          console.log(`  ✅ Updated image ${image.id}:\n  ${description}\n`);
          return {
            success: true,
            imageId: image.id,
            description,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `  ❌ Error processing image ${image.id}: ${errorMessage}`,
          );
          return {
            success: false,
            imageId: image.id,
            error: errorMessage,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Count results
      batchResults.forEach((result) => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      processed += batch.length;
      const progressPercent = Math.round(
        (processed / imagesWithoutDescriptions.length) * 100,
      );
      console.log(
        `  📊 Progress: ${processed}/${imagesWithoutDescriptions.length} (${progressPercent}%)`,
      );
      console.log(`  📈 Success: ${successCount}, Errors: ${errorCount}`);

      // Add delay between batches to avoid rate limits
      if (i + batchSize < imagesWithoutDescriptions.length) {
        console.log('  ⏳ Waiting 3 seconds before next batch...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // Final summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('🎉 UPDATE COMPLETE');
    console.log('='.repeat(50));
    console.log(`📊 Total images processed: ${processed}`);
    console.log(`✅ Successful updates: ${successCount}`);
    console.log(`❌ Failed updates: ${errorCount}`);
    console.log(
      `📈 Success rate: ${Math.round((successCount / processed) * 100)}%`,
    );

    // Show failed images for manual review
    const failedImages = results.filter((r) => !r.success);
    if (failedImages.length > 0) {
      console.log('\n❌ Failed images (for manual review):');
      failedImages.forEach((failed) => {
        console.log(`  - Image ID: ${failed.imageId}, Error: ${failed.error}`);
      });
    }
  } catch (error) {
    console.error('💥 Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  updateImageDescriptions()
    .then(() => {
      console.log('\n🎯 Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}
