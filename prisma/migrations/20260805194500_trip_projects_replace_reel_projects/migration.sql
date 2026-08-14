-- DropReelProjects
DROP TABLE IF EXISTS "ReelProjectClip";
DROP TABLE IF EXISTS "ReelProject";

-- CreateTable
CREATE TABLE "TripProject" (
    "id" SERIAL NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripProjectClip" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "trimStartSec" DOUBLE PRECISION,
    "trimEndSec" DOUBLE PRECISION,
    "trimmedVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripProjectClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripProject_tripId_idx" ON "TripProject"("tripId");

-- CreateIndex
CREATE INDEX "TripProjectClip_projectId_position_idx" ON "TripProjectClip"("projectId", "position");

-- CreateIndex
CREATE INDEX "TripProjectClip_mediaId_idx" ON "TripProjectClip"("mediaId");

-- AddForeignKey
ALTER TABLE "TripProject" ADD CONSTRAINT "TripProject_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripProjectClip" ADD CONSTRAINT "TripProjectClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TripProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripProjectClip" ADD CONSTRAINT "TripProjectClip_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "TripMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
