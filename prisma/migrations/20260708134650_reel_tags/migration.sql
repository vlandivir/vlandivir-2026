-- CreateTable
CREATE TABLE "ReelTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReelTag_name_key" ON "ReelTag"("name");
