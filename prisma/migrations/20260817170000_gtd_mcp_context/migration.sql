-- AlterTable
ALTER TABLE "GtdAttachment" ADD COLUMN "description" TEXT;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "gtdTaskId" TEXT;

-- CreateIndex
CREATE INDEX "EmailMessage_gtdTaskId_idx" ON "EmailMessage"("gtdTaskId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_gtdTaskId_fkey" FOREIGN KEY ("gtdTaskId") REFERENCES "GtdTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "GtdEmbedding" (
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GtdEmbedding_pkey" PRIMARY KEY ("taskId")
);

-- CreateIndex
CREATE INDEX "GtdEmbedding_workspaceId_idx" ON "GtdEmbedding"("workspaceId");

-- AddForeignKey
ALTER TABLE "GtdEmbedding" ADD CONSTRAINT "GtdEmbedding_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GtdTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtdEmbedding" ADD CONSTRAINT "GtdEmbedding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "GtdWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
