-- CreateTable
CREATE TABLE "ReelProject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelProjectClip" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "reelId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "trimStartSec" DOUBLE PRECISION,
    "trimEndSec" DOUBLE PRECISION,
    "trimmedVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelProjectClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelProjectClip_projectId_position_idx" ON "ReelProjectClip"("projectId", "position");

-- CreateIndex
CREATE INDEX "ReelProjectClip_reelId_idx" ON "ReelProjectClip"("reelId");

-- AddForeignKey
ALTER TABLE "ReelProjectClip" ADD CONSTRAINT "ReelProjectClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ReelProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelProjectClip" ADD CONSTRAINT "ReelProjectClip_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
