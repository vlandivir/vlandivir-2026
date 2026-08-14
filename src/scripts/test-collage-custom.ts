import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';

async function testCollageWithCustomImages() {
  console.log('🎨 Testing collage generation with custom images...\n');

  // Get custom images directory from command line argument or use default
  const customImagesDir =
    process.argv[2] || path.join(__dirname, '../../custom-images');

  if (!fs.existsSync(customImagesDir)) {
    console.error(`❌ Directory not found: ${customImagesDir}`);
    console.log('💡 Create a directory with your images or specify a path:');
    console.log('   npm run test-collage-custom /path/to/your/images');
    return;
  }

  try {
    // Read custom images, excluding collage results
    const imageFiles = fs
      .readdirSync(customImagesDir)
      .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .filter((file) => !file.includes('collage-result')) // Exclude previous collage results
      .slice(0, 10); // Use up to 10 images

    if (imageFiles.length < 2) {
      console.error('❌ Need at least 2 images in the directory');
      console.log(
        `📁 Found ${imageFiles.length} images in: ${customImagesDir}`,
      );
      return;
    }

    console.log(`📸 Found ${imageFiles.length} images:`, imageFiles);

    // Load image buffers
    const imageBuffers = await Promise.all(
      imageFiles.map((file) => {
        const filePath = path.join(customImagesDir, file);
        return fs.readFileSync(filePath);
      }),
    );

    console.log('🔄 Creating collage...');
    const startTime = Date.now();

    // Create collage using the same logic as the service
    const collageBuffer = await createCollage(imageBuffers);

    const endTime = Date.now();
    console.log(`✅ Collage created successfully in ${endTime - startTime}ms`);

    // Save the collage locally
    const outputPath = path.join(customImagesDir, 'collage-result.jpg');
    fs.writeFileSync(outputPath, collageBuffer);
    console.log(`💾 Collage saved to: ${outputPath}`);

    // Get file size
    const stats = fs.statSync(outputPath);
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);

    console.log('\n🎉 Custom collage test completed successfully!');
  } catch (error) {
    console.error('❌ Error testing collage generation:', error);
  }
}

async function createCollage(imageBuffers: Buffer[]): Promise<Buffer> {
  try {
    if (imageBuffers.length < 2) {
      throw new Error('Need at least 2 images for collage');
    }

    // Get metadata of the first image to determine dimensions
    const firstImageMetadata = await sharp(imageBuffers[0]).metadata();
    if (!firstImageMetadata.width || !firstImageMetadata.height) {
      throw new Error('Could not get first image dimensions');
    }

    const mainImageWidth = firstImageMetadata.width;
    const mainImageHeight = firstImageMetadata.height;
    const spacing = 5; // Small gap between images

    // Calculate dimensions for additional images
    const additionalImagesCount = imageBuffers.length - 1;
    const totalSpacing = (additionalImagesCount - 1) * spacing;
    const availableWidth = mainImageWidth - totalSpacing;
    const additionalImageWidth = Math.floor(
      availableWidth / additionalImagesCount,
    );

    // Calculate heights for all additional images first
    let maxAdditionalHeight = 0;
    const additionalImageHeights: number[] = [];

    for (let i = 1; i < imageBuffers.length; i++) {
      // Get original image metadata to calculate aspect ratio
      const imageMetadata = await sharp(imageBuffers[i]).metadata();
      if (!imageMetadata.width || !imageMetadata.height) {
        throw new Error(`Could not get metadata for image ${i}`);
      }

      // Calculate height to preserve aspect ratio
      const aspectRatio = imageMetadata.width / imageMetadata.height;
      const additionalImageHeight = Math.floor(
        additionalImageWidth / aspectRatio,
      );
      additionalImageHeights.push(additionalImageHeight);
      maxAdditionalHeight = Math.max(
        maxAdditionalHeight,
        additionalImageHeight,
      );

      console.log(
        `📐 Image ${i}: ${additionalImageWidth}x${additionalImageHeight} (original: ${imageMetadata.width}x${imageMetadata.height})`,
      );
    }

    // Calculate total dimensions
    const totalWidth = mainImageWidth;
    const totalHeight = mainImageHeight + spacing + maxAdditionalHeight;

    console.log(`📐 Collage dimensions: ${totalWidth}x${totalHeight}`);
    console.log(`📐 Main image: ${mainImageWidth}x${mainImageHeight}`);
    console.log(`📐 Additional images width: ${additionalImageWidth}`);
    console.log(`📐 Max additional height: ${maxAdditionalHeight}`);
    console.log(
      `📐 Total spacing: ${totalSpacing}px, Available width: ${availableWidth}px`,
    );

    // Create canvas
    const canvas = sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }, // White background
      },
    });

    // Create composite array
    const composite: sharp.OverlayOptions[] = [];

    // Add main image (first image) at the top - keep original size
    composite.push({
      input: imageBuffers[0],
      left: 0,
      top: 0,
    });

    // Add additional images in a row below
    for (let i = 1; i < imageBuffers.length; i++) {
      const processedImage = await sharp(imageBuffers[i])
        .resize(additionalImageWidth, additionalImageHeights[i - 1], {
          fit: 'inside',
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const left = (i - 1) * (additionalImageWidth + spacing);
      composite.push({
        input: processedImage,
        left,
        top: mainImageHeight + spacing,
      });
    }

    // Create final collage
    const collageBuffer = await canvas
      .composite(composite)
      .jpeg({ quality: 90 })
      .toBuffer();

    return collageBuffer;
  } catch (error) {
    console.error('Error in createCollage:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testCollageWithCustomImages()
    .then(() => {
      console.log('\n🎉 Custom collage test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Custom collage test failed:', error);
      process.exit(1);
    });
}
