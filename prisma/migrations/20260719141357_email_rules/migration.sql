-- CreateTable
CREATE TABLE "EmailRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "effects" JSONB NOT NULL DEFAULT '{}',
    "accounts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailRule_enabled_idx" ON "EmailRule"("enabled");
