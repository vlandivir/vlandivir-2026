-- CreateTable
CREATE TABLE "Reel" (
    "id" SERIAL NOT NULL,
    "instagramUrl" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "title" TEXT,
    "description" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "duration" DOUBLE PRECISION,
    "videoUrl" TEXT,
    "coverUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reel_shortcode_key" ON "Reel"("shortcode");

-- CreateIndex
CREATE INDEX "Reel_status_idx" ON "Reel"("status");
