-- AlterTable
ALTER TABLE "GtdTask" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GtdTask_workspaceId_dueDate_status_orderKey_idx" ON "GtdTask"("workspaceId", "dueDate", "status", "orderKey");
