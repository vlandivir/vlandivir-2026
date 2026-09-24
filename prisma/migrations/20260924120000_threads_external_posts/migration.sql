ALTER TABLE "ThreadsPost" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'composer';
ALTER TABLE "ThreadsMedia" ADD COLUMN "thumbnailUrl" TEXT;
