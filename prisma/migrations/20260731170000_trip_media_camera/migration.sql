-- AlterTable
ALTER TABLE "TripMedia" ADD COLUMN "cameraModel" TEXT;

-- CreateIndex
CREATE INDEX "TripMedia_tripId_takenAt_idx" ON "TripMedia"("tripId", "takenAt");
