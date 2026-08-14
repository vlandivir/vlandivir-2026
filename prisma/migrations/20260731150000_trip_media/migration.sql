-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerContributorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMedia" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "userAgent" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "takenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TripMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_secret_key" ON "Trip"("secret");

-- CreateIndex
CREATE INDEX "TripMedia_tripId_createdAt_idx" ON "TripMedia"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "TripMedia_tripId_deletedAt_idx" ON "TripMedia"("tripId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripMedia_tripId_contentHash_key" ON "TripMedia"("tripId", "contentHash");

-- AddForeignKey
ALTER TABLE "TripMedia" ADD CONSTRAINT "TripMedia_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
