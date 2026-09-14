-- Preserve existing image attachments while generalizing them to mixed media.
ALTER TABLE "ThreadsImage" RENAME TO "ThreadsMedia";
ALTER TABLE "ThreadsMedia" RENAME CONSTRAINT "ThreadsImage_pkey" TO "ThreadsMedia_pkey";
ALTER TABLE "ThreadsMedia" RENAME CONSTRAINT "ThreadsImage_postId_fkey" TO "ThreadsMedia_postId_fkey";
ALTER INDEX "ThreadsImage_postId_idx" RENAME TO "ThreadsMedia_postId_idx";

ALTER TABLE "ThreadsMedia"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'image',
ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
ADD COLUMN "size" BIGINT,
ADD COLUMN "originalFilename" TEXT,
ADD COLUMN "uploadStatus" TEXT NOT NULL DEFAULT 'ready';

UPDATE "ThreadsMedia"
SET "mimeType" = 'image/png'
WHERE LOWER("key") LIKE '%.png';
