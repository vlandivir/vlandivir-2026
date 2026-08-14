-- CreateTable
CREATE TABLE "Todo" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "completedAt" TIMESTAMP(3),
    "priority" VARCHAR(1),
    "dueDate" TIMESTAMP(3),
    "tags" TEXT[],
    "contexts" TEXT[],
    "projects" TEXT[],

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Todo_key_idx" ON "Todo"("key");
