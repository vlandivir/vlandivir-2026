-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "chatId" BIGINT;

-- CreateIndex
CREATE INDEX "Todo_chatId_idx" ON "Todo"("chatId");
