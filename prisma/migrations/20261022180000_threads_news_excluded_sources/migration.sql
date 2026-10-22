CREATE TABLE "ThreadsNewsExcludedSource" (
    "username" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'removed',
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreadsNewsExcludedSource_pkey" PRIMARY KEY ("username")
);

-- These profiles were explicitly removed before exclusions were recorded.
INSERT INTO "ThreadsNewsExcludedSource" ("username", "reason") VALUES
    ('techcrunch', 'removed_before_tracking'),
    ('github', 'removed_before_tracking'),
    ('n1srbija_', 'removed_before_tracking'),
    ('gergelyorosz_', 'removed_before_tracking')
ON CONFLICT ("username") DO NOTHING;
