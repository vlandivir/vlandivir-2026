-- CreateIndex
CREATE INDEX "TripMedia_tripId_originalFilename_size_idx" ON "TripMedia"("tripId", "originalFilename", "size");
