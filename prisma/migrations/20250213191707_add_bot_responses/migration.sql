-- CreateTable
CREATE TABLE "BotResponse" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "noteId" INTEGER NOT NULL,
    "chatId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "BotResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotResponse_chatId_idx" ON "BotResponse"("chatId");

-- CreateIndex
CREATE INDEX "BotResponse_noteId_idx" ON "BotResponse"("noteId");
