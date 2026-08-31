ALTER TABLE "Trip"
ADD COLUMN "yandexDiskPath" TEXT,
ADD COLUMN "yandexDiskPublicUrl" TEXT,
ADD COLUMN "yandexDiskAutoSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "yandexDiskSyncStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN "yandexDiskSyncStartedAt" TIMESTAMP(3),
ADD COLUMN "yandexDiskSyncedAt" TIMESTAMP(3),
ADD COLUMN "yandexDiskSyncError" TEXT;

ALTER TABLE "TripMedia"
ADD COLUMN "yandexDiskPath" TEXT,
ADD COLUMN "yandexDiskSyncedAt" TIMESTAMP(3),
ADD COLUMN "yandexDiskSyncError" TEXT;
