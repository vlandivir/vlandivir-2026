-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailActionLog" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "param" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "ruleId" INTEGER,
    "prevState" JSONB,
    "result" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailActionLog_messageId_idx" ON "EmailActionLog"("messageId");

-- CreateIndex
CREATE INDEX "EmailActionLog_createdAt_idx" ON "EmailActionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "EmailActionLog" ADD CONSTRAINT "EmailActionLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
