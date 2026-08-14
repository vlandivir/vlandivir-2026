-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "transcriptError" TEXT,
ADD COLUMN     "transcriptLang" TEXT,
ADD COLUMN     "transcriptStatus" TEXT NOT NULL DEFAULT 'none';
