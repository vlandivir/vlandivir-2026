-- CreateTable
CREATE TABLE "TaskNote" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" BIGINT NOT NULL,

    CONSTRAINT "TaskNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskNote_key_idx" ON "TaskNote"("key");

-- CreateIndex
CREATE INDEX "TaskNote_chatId_idx" ON "TaskNote"("chatId");
