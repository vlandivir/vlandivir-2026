-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "noteId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
