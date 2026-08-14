/*
  Warnings:

  - Added the required column `rawMessage` to the `Note` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rawMessage" JSONB NOT NULL;

-- CreateIndex
CREATE INDEX "Note_noteDate_idx" ON "Note"("noteDate");
