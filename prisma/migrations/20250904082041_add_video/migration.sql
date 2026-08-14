-- CreateTable
CREATE TABLE "Video" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "noteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
