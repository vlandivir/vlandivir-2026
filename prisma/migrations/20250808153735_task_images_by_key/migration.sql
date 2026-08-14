/*
  Warnings:

  - You are about to drop the column `todoId` on the `Image` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_todoId_fkey";

-- AlterTable
ALTER TABLE "Image" DROP COLUMN "todoId";

-- CreateTable
CREATE TABLE "TaskImage" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "chatId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskImage_key_idx" ON "TaskImage"("key");

-- CreateIndex
CREATE INDEX "TaskImage_chatId_idx" ON "TaskImage"("chatId");
