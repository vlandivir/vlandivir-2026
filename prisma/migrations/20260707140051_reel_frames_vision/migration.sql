-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "frameUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visionDescription" TEXT,
ADD COLUMN     "visionError" TEXT,
ADD COLUMN     "visionStatus" TEXT NOT NULL DEFAULT 'none';
