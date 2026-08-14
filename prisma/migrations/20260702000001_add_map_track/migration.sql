-- CreateTable
CREATE TABLE "MapTrack" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instagramUrl" TEXT,
    "points" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapTrack_pkey" PRIMARY KEY ("id")
);
