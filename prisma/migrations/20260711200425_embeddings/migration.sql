-- Enable pgvector (available on DigitalOcean managed Postgres)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Embedding" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "chatId" BIGINT,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_kind_refId_key" ON "Embedding"("kind", "refId");
