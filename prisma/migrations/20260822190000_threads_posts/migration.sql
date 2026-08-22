-- CreateTable
CREATE TABLE "ThreadsPost" (
    "id" SERIAL NOT NULL,
    "canvasId" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "destination" TEXT NOT NULL DEFAULT 'threads',
    "ghost" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT,
    "poll" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "mediaId" TEXT,
    "diaryNoteId" INTEGER,
    "stats" JSONB,
    "statsPrev" JSONB,
    "pollResults" JSONB,
    "repliesJson" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadsImage" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadsImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadsPost_canvasId_key" ON "ThreadsPost"("canvasId");

-- CreateIndex
CREATE INDEX "ThreadsPost_status_updatedAt_idx" ON "ThreadsPost"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ThreadsImage_postId_idx" ON "ThreadsImage"("postId");

-- AddForeignKey
ALTER TABLE "ThreadsImage" ADD CONSTRAINT "ThreadsImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ThreadsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
