-- Bring reel tags back as a hand-edited field (auto-generation stays removed)
ALTER TABLE "Reel" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
