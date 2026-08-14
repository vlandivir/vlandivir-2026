import { PrismaClient } from '../generated/prisma-client';

async function checkImageStatus() {
  const prisma = new PrismaClient();

  try {
    console.log('📊 Checking image status in database...\n');

    // Get total count
    const totalImages = await prisma.image.count();
    console.log(`📸 Total images: ${totalImages}`);

    // Get images with descriptions
    const imagesWithDescriptions = await prisma.image.count({
      where: {
        AND: [{ description: { not: null } }, { description: { not: '' } }],
      },
    });
    console.log(`✅ Images with descriptions: ${imagesWithDescriptions}`);

    // Get images without descriptions
    const imagesWithoutDescriptions = await prisma.image.count({
      where: {
        OR: [{ description: null }, { description: '' }],
      },
    });
    console.log(`❌ Images without descriptions: ${imagesWithoutDescriptions}`);

    // Calculate percentage
    const percentageWithDescriptions =
      totalImages > 0
        ? Math.round((imagesWithDescriptions / totalImages) * 100)
        : 0;
    console.log(
      `📈 Percentage with descriptions: ${percentageWithDescriptions}%`,
    );

    // Show some recent images with descriptions
    const recentImagesWithDescriptions = await prisma.image.findMany({
      where: {
        AND: [{ description: { not: null } }, { description: { not: '' } }],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
      include: {
        note: true,
      },
    });

    if (recentImagesWithDescriptions.length > 0) {
      console.log('\n🆕 Recent images with descriptions:');
      recentImagesWithDescriptions.forEach((image) => {
        console.log(
          `  - ID: ${image.id}, Date: ${image.createdAt.toISOString().split('T')[0]}`,
        );
        console.log(`    Description: ${image.description}`);
        console.log('');
      });
    }

    // Show some images without descriptions
    const recentImagesWithoutDescriptions = await prisma.image.findMany({
      where: {
        OR: [{ description: null }, { description: '' }],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    if (recentImagesWithoutDescriptions.length > 0) {
      console.log('🔄 Recent images without descriptions:');
      recentImagesWithoutDescriptions.forEach((image) => {
        console.log(
          `  - ID: ${image.id}, Date: ${image.createdAt.toISOString().split('T')[0]}`,
        );
      });
    }

    // Cost estimation for OpenAI API
    if (imagesWithoutDescriptions > 0) {
      console.log('\n💰 Cost estimation for OpenAI API:');
      console.log(`  - Images to process: ${imagesWithoutDescriptions}`);
      console.log(`  - Estimated cost per image: ~$0.01-0.02 (GPT-4o-mini)`);
      console.log(
        `  - Total estimated cost: $${(imagesWithoutDescriptions * 0.015).toFixed(2)}`,
      );
    }
  } catch (error) {
    console.error('💥 Error checking image status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  checkImageStatus()
    .then(() => {
      console.log('\n🎯 Status check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Status check failed:', error);
      process.exit(1);
    });
}
