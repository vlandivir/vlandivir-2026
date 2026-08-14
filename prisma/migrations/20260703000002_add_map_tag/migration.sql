-- CreateTable
CREATE TABLE "MapTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapTag_name_key" ON "MapTag"("name");

-- Seed the initial tag dictionary
INSERT INTO "MapTag" ("name", "emoji") VALUES
    ('ресторан', '🍽'),
    ('бар', '🍺'),
    ('природа', '🌿');
