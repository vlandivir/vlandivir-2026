-- Soft-delete / archive for diary notes
ALTER TABLE "Note" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Note_chatId_deletedAt_idx" ON "Note"("chatId", "deletedAt");
