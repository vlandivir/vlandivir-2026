/*
  Warnings:

  - You are about to drop the column `userId` on the `Note` table. All the data in the column will be lost.
  - Added the required column `chatId` to the `Note` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Note_userId_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "userId",
ADD COLUMN     "chatId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Note_chatId_idx" ON "Note"("chatId");
