-- AlterTable
ALTER TABLE "GtdWorkspace" ADD COLUMN "mcpToken" TEXT;

UPDATE "GtdWorkspace"
SET "mcpToken" = 'gtd_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE "mcpToken" IS NULL;

ALTER TABLE "GtdWorkspace" ALTER COLUMN "mcpToken" SET NOT NULL;

CREATE UNIQUE INDEX "GtdWorkspace_mcpToken_key" ON "GtdWorkspace"("mcpToken");
