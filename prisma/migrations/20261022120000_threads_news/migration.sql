-- CreateTable
CREATE TABLE "ThreadsNewsSource" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastNewCount" INTEGER NOT NULL DEFAULT 0,
    "coverageLimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadsNewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadsNewsPost" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "remoteId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER,
    "translationRu" TEXT,
    "translationCheckedAt" TIMESTAMP(3),
    "translationStartedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadsNewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadsNewsTranslationQuota" (
    "month" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ThreadsNewsTranslationQuota_pkey" PRIMARY KEY ("month")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadsNewsSource_username_key" ON "ThreadsNewsSource"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadsNewsPost_remoteId_key" ON "ThreadsNewsPost"("remoteId");

-- CreateIndex
CREATE INDEX "ThreadsNewsPost_sourceId_publishedAt_idx" ON "ThreadsNewsPost"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "ThreadsNewsPost_publishedAt_id_idx" ON "ThreadsNewsPost"("publishedAt", "id");

-- AddForeignKey
ALTER TABLE "ThreadsNewsPost" ADD CONSTRAINT "ThreadsNewsPost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ThreadsNewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
