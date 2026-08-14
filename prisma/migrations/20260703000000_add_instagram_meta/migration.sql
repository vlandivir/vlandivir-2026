-- AlterTable
ALTER TABLE "MapPoint" ADD COLUMN "instagramMeta" JSONB,
ADD COLUMN "instagramMetaUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MapTrack" ADD COLUMN "instagramMeta" JSONB,
ADD COLUMN "instagramMetaUpdatedAt" TIMESTAMP(3);
