-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_noteId_fkey";

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "todoId" INTEGER,
ALTER COLUMN "noteId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
